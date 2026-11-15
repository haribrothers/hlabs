// Finding network drives (US-FILE-11): SMB and NFS servers that announce themselves with mDNS, and the shares a
// server lists for a guest. macOS: `dns-sd` to browse and resolve, `smbutil view -g -N` for SMB shares. Linux:
// `avahi-browse` (avahi-utils, D-074), `smbclient -L -N` when it's installed. Both: `showmount -e` for NFS exports.
// A server that won't list its shares to a guest has `shares: null`: the admin types the share name. Never a password
// on a command line (07 §7.7), so shares are only ever listed as a guest. Behind an interface for tests.
import { spawn } from 'node:child_process';
import { nodeExec, type Exec } from './network-mount';

export interface FoundServer {
  /** What it calls itself on the network ("NAS", "DiskStation"). */
  name: string;
  /** "nas.local" */
  host: string;
  protocol: 'smb' | 'nfs';
  /** Shares a guest can see; null when it won't say. */
  shares: string[] | null;
}

export interface NetworkDiscovery {
  /** Servers that answer within `timeoutMs`, each with its shares when a guest may list them. */
  browse(timeoutMs: number): Promise<FoundServer[]>;
  /** A server's shares as a guest; null when it won't list them. */
  shares(protocol: 'smb' | 'nfs', host: string): Promise<string[] | null>;
}

/** Runs `command` for `ms` and returns what it printed (dns-sd -B never exits by itself). */
export function runFor(command: string, args: string[], ms: number): Promise<string> {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      resolve('');
      return;
    }
    child.stdout.on('data', (d: Buffer) => (out += d.toString('utf8')));
    child.on('error', () => resolve(out));
    const timer = setTimeout(() => child.kill('SIGTERM'), ms);
    child.on('close', () => {
      clearTimeout(timer);
      resolve(out);
    });
  });
}

/** Lines of `dns-sd -B` that add an instance: its name (the last column, which may have spaces). */
export function parseDnsSdBrowse(out: string): string[] {
  const names = new Set<string>();
  for (const line of out.split('\n')) {
    const m = /^\S+\s+Add\s+\d+\s+\d+\s+\S+\s+_\w+\._tcp\.\s+(.+)$/.exec(line.trim());
    if (m) names.add(m[1]!.trim());
  }
  return [...names];
}

/** `dns-sd -L` → the host it can be reached at ("nas.local"). */
export function parseDnsSdResolve(out: string): string | null {
  const m = /can be reached at (\S+?)\.?:\d+/.exec(out);
  return m ? m[1]!.replace(/\.$/, '') : null;
}

/** `avahi-browse -rpt` resolved lines: `=;iface;IPv4;name;_smb._tcp;local;host;address;port;txt`. */
export function parseAvahi(out: string, type: string): Array<{ name: string; host: string }> {
  const found = new Map<string, { name: string; host: string }>();
  for (const line of out.split('\n')) {
    const f = line.split(';');
    if (f[0] !== '=' || f[4] !== type || !f[6]) continue;
    // avahi escapes some characters as \DDD.
    const name = f[3]!.replace(/\\(\d{3})/g, (_, d: string) => String.fromCharCode(Number(d)));
    found.set(f[6], { name, host: f[6] });
  }
  return [...found.values()];
}

/** `smbutil view` and `smbclient -L` tables: disk shares only, never hidden `$` ones. */
export function parseSmbShares(out: string): string[] {
  const shares: string[] = [];
  for (const line of out.split('\n')) {
    const m = /^\s*(.+?)\s{2,}Disk\b/.exec(line);
    if (m && !m[1]!.endsWith('$')) shares.push(m[1]!.trim());
  }
  return shares;
}

/** `showmount -e host`: one export per line after the header. */
export function parseShowmount(out: string): string[] {
  return out
    .split('\n')
    .slice(1)
    .map((l) => l.trim().split(/\s+/)[0] ?? '')
    .filter((p) => p.startsWith('/'));
}

const BROWSE_TYPES = [
  ['_smb._tcp', 'smb'],
  ['_nfs._tcp', 'nfs'],
] as const;

abstract class SystemDiscovery implements NetworkDiscovery {
  constructor(protected readonly exec: Exec = nodeExec) {}

  protected abstract find(type: string, ms: number): Promise<Array<{ name: string; host: string }>>;
  protected abstract smbShares(host: string): Promise<string[] | null>;

  async shares(protocol: 'smb' | 'nfs', host: string) {
    if (protocol === 'smb') return this.smbShares(host);
    const res = await this.exec('showmount', ['-e', host]);
    return res.code === 0 ? parseShowmount(res.stdout) : null;
  }

  async browse(timeoutMs: number): Promise<FoundServer[]> {
    // Most of the time looking, the rest asking each server for its shares.
    const look = Math.max(1_000, timeoutMs - 2_000);
    const lists = await Promise.all(
      BROWSE_TYPES.map(async ([type, protocol]) =>
        (await this.find(type, look)).map((s) => ({ ...s, protocol: protocol as 'smb' | 'nfs' })),
      ),
    );
    const servers = lists.flat();
    return Promise.all(
      servers.map(async (s) => ({
        ...s,
        shares: await Promise.race([
          this.shares(s.protocol, s.host).catch(() => null),
          new Promise<null>((r) => setTimeout(() => r(null), 2_000)),
        ]),
      })),
    );
  }
}

export class MacDiscovery extends SystemDiscovery {
  protected async find(type: string, ms: number) {
    const names = parseDnsSdBrowse(await runFor('/usr/bin/dns-sd', ['-B', type, 'local.'], ms));
    const found = await Promise.all(
      names.map(async (name) => {
        const host = parseDnsSdResolve(await runFor('/usr/bin/dns-sd', ['-L', name, type, 'local.'], 1_500));
        return host ? { name, host } : null;
      }),
    );
    return found.filter((s): s is { name: string; host: string } => s !== null);
  }

  protected async smbShares(host: string) {
    const res = await this.exec('/usr/bin/smbutil', ['view', '-g', '-N', `//${host}`]);
    return res.code === 0 ? parseSmbShares(res.stdout) : null;
  }
}

export class LinuxDiscovery extends SystemDiscovery {
  protected async find(type: string, ms: number) {
    return parseAvahi(await runFor('avahi-browse', ['-rpt', type], ms), type);
  }

  protected async smbShares(host: string) {
    const res = await this.exec('smbclient', ['-L', host, '-N', '-g']);
    if (res.code !== 0) return null;
    // `-g`: Disk|name|comment
    return res.stdout
      .split('\n')
      .map((l) => l.split('|'))
      .filter((f) => f[0] === 'Disk' && f[1] && !f[1].endsWith('$'))
      .map((f) => f[1]!);
  }
}
