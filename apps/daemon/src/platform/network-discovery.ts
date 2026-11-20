// Finding network drives (US-FILE-11): SMB and NFS servers that announce themselves with mDNS, and the shares a
// server lists for a guest. macOS: `dns-sd` to browse and resolve, `smbutil view -g -N` for SMB shares. Linux:
// `avahi-browse` (avahi-utils, D-074), `smbclient -L -N` when it's installed. Both: `showmount -e` for NFS exports.
// A server that won't list its shares to a guest has `shares: null`: the admin signs in to list them (or types the share
// name). Never a password on a command line (07 §7.7): macOS answers smbutil's password prompt with `expect`, which
// reads it from its environment; Linux gives smbclient a credentials file (0600, removed after). Behind an interface.
import { hlabsError } from '@hlabs/api';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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

/** A username and password to list a server's shares with. */
export interface ShareLogin {
  username: string;
  password: string;
}

export interface NetworkDiscovery {
  /** Servers that answer within `timeoutMs`, each with its shares when a guest may list them. */
  browse(timeoutMs: number): Promise<FoundServer[]>;
  /**
   * A server's shares as a guest, or as `login` (SMB); null when it won't list them. A login it refuses is
   * NAS_AUTH_FAILED; a server that doesn't answer, NAS_UNREACHABLE.
   */
  shares(protocol: 'smb' | 'nfs', host: string, login?: ShareLogin): Promise<string[] | null>;
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
  protected abstract smbSharesAs(host: string, login: ShareLogin): Promise<string[]>;

  async shares(protocol: 'smb' | 'nfs', host: string, login?: ShareLogin) {
    if (protocol === 'smb') return login ? this.smbSharesAs(host, login) : this.smbShares(host);
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

  /**
   * smbutil asks for the password on a terminal and drops anything typed before its prompt, so `expect` waits for the
   * prompt and answers with the password from its environment; nothing is echoed or logged until it's sent.
   */
  protected async smbSharesAs(host: string, login: ShareLogin) {
    const res = await this.exec('/usr/bin/expect', ['-c', SMBUTIL_LOGIN], {
      env: {
        PATH: '/usr/bin:/bin',
        HLABS_SMB_HOST: host,
        HLABS_SMB_USER: encodeURIComponent(login.username),
        HLABS_SMB_PASSWORD: login.password,
      },
    });
    return smbLoginResult(res.code, res.stdout);
  }
}

/** The expect script: smbutil view as a user, the password typed at its prompt (exit code passed on; 3 = no prompt). */
export const SMBUTIL_LOGIN = `log_user 0
set timeout 20
spawn -noecho /usr/bin/smbutil view //$env(HLABS_SMB_USER)@$env(HLABS_SMB_HOST)
expect {
  -re "Password for" { send -- "$env(HLABS_SMB_PASSWORD)\r" }
  timeout { exit 3 }
  eof { }
}
log_user 1
expect eof
catch wait result
exit [lindex $result 3]`;

/** smbutil view as a user: 77 or "Authentication error" is a refused login; a table is the shares. */
export function smbLoginResult(code: number, out: string): string[] {
  if (code === 77 || /authentication error|logon failure|NT_STATUS_LOGON_FAILURE|NT_STATUS_ACCESS_DENIED/i.test(out))
    throw hlabsError('NAS_AUTH_FAILED');
  if (code !== 0) throw hlabsError('NAS_UNREACHABLE', 'unreachable', { reason: 'unreachable' });
  return parseSmbShares(out);
}

export class LinuxDiscovery extends SystemDiscovery {
  constructor(
    /** Where the credentials file is written (0600), inside the data dir. */
    private readonly tmpDir: string,
    exec: Exec = nodeExec,
  ) {
    super(exec);
  }

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

  /** smbclient reads the login from a credentials file, never the command line. */
  protected async smbSharesAs(host: string, login: ShareLogin) {
    await mkdir(this.tmpDir, { recursive: true, mode: 0o700 });
    const credentials = join(this.tmpDir, `smb-list-${process.pid}-${Date.now()}`);
    await writeFile(credentials, `username=${login.username}\npassword=${login.password}\n`, { mode: 0o600 });
    try {
      const res = await this.exec('smbclient', ['-L', host, '-A', credentials, '-g']);
      if (/NT_STATUS_LOGON_FAILURE|NT_STATUS_ACCESS_DENIED/.test(res.stdout + res.stderr)) {
        throw hlabsError('NAS_AUTH_FAILED');
      }
      if (res.code !== 0) throw hlabsError('NAS_UNREACHABLE', 'unreachable', { reason: 'unreachable' });
      return res.stdout
        .split('\n')
        .map((l) => l.split('|'))
        .filter((f) => f[0] === 'Disk' && f[1] && !f[1].endsWith('$'))
        .map((f) => f[1]!);
    } finally {
      await rm(credentials, { force: true });
    }
  }
}
