// The real Tailscale client: HTTP to the LocalAPI of the Tailscale on this computer (spike R-12, D-104).
//  · macOS standalone (io.tailscale.ipn.macsys): 127.0.0.1:<port from /Library/Tailscale/ipnport>, Basic auth with the
//    token in /Library/Tailscale/sameuserproof-<port> (the port changes each launch, so it's read every time).
//  · macOS App Store: the same, from the app's group container (`sameuserproof-<port>-<token>`); not yet tried live.
//  · open-source tailscaled (macOS, Linux): a unix socket. Linux writes need root or `tailscale set --operator`.
import { request } from 'node:http';
import { access, readdir, readFile, readlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { TailscaleError, type ServeConfig, type TailscaleClient, type TailscaleState } from './types';

type Transport = { kind: 'tcp'; port: number; token: string } | { kind: 'socket'; path: string };

const SOCKETS = ['/var/run/tailscaled.socket', '/var/run/tailscale/tailscaled.sock', '/run/tailscale/tailscaled.sock'];
const APPS = ['/Applications/Tailscale.app'];
const BINARIES = [
  '/usr/bin/tailscale',
  '/usr/local/bin/tailscale',
  '/usr/sbin/tailscaled',
  '/opt/homebrew/bin/tailscale',
];

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

async function standaloneMac(): Promise<Transport | null> {
  try {
    const port = Number(
      (await readlink('/Library/Tailscale/ipnport').catch(() => readFile('/Library/Tailscale/ipnport', 'utf8'))).trim(),
    );
    if (!port) return null;
    const token = (await readFile(`/Library/Tailscale/sameuserproof-${port}`, 'utf8')).trim();
    return { kind: 'tcp', port, token };
  } catch {
    return null;
  }
}

async function appStoreMac(): Promise<Transport | null> {
  const base = join(homedir(), 'Library', 'Group Containers');
  try {
    for (const dir of await readdir(base)) {
      if (!/io\.tailscale\.ipn\.macos$/.test(dir)) continue;
      for (const name of await readdir(join(base, dir))) {
        const m = /^sameuserproof-(\d+)-(.+)$/.exec(name);
        if (m) return { kind: 'tcp', port: Number(m[1]), token: m[2]! };
      }
    }
  } catch {
    /* no group containers */
  }
  return null;
}

async function discover(): Promise<Transport | null> {
  if (process.platform === 'darwin') {
    const tcp = (await standaloneMac()) ?? (await appStoreMac());
    if (tcp) return tcp;
  }
  for (const path of SOCKETS) if (await exists(path)) return { kind: 'socket', path };
  return null;
}

async function installed(): Promise<boolean> {
  for (const path of [...APPS, ...BINARIES]) if (await exists(path)) return true;
  return false;
}

interface Reply {
  status: number;
  body: string;
  etag: string | null;
}

function call(
  t: Transport,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request(
      {
        method,
        path: `/localapi/v0/${path}`,
        ...(t.kind === 'tcp' ? { host: '127.0.0.1', port: t.port, auth: `:${t.token}` } : { socketPath: t.path }),
        headers: {
          Host: 'local-tailscaled.sock',
          'Sec-Tailscale': 'localapi',
          ...(payload ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        timeout: 5_000,
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (data += c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: data, etag: (res.headers.etag as string | undefined) ?? null }),
        );
      },
    );
    req.on('timeout', () => req.destroy(new Error('LocalAPI timed out')));
    req.on('error', (err) => reject(new TailscaleError('unavailable', err.message)));
    if (payload) req.write(payload);
    req.end();
  });
}

function check(reply: Reply, what: string): Reply {
  if (reply.status === 403 || reply.status === 401) throw new TailscaleError('permission', `${what}: ${reply.status}`);
  if (reply.status === 412) throw new TailscaleError('conflict', `${what}: changed meanwhile`);
  if (reply.status >= 300)
    throw new TailscaleError('unavailable', `${what}: ${reply.status} ${reply.body.slice(0, 200)}`);
  return reply;
}

interface StatusJson {
  BackendState?: string;
  AuthURL?: string;
  MagicDNSSuffix?: string;
  CertDomains?: string[] | null;
  Self?: { DNSName?: string; KeyExpiry?: string };
}

/** The state from a LocalAPI status (exported for tests). */
export function stateFromStatus(s: StatusJson): TailscaleState {
  if (s.BackendState === 'Running') {
    const dnsName = (s.Self?.DNSName ?? '').replace(/\.$/, '');
    const tailnet = (s.MagicDNSSuffix ?? '').replace(/\.$/, '');
    const nodeName =
      tailnet && dnsName.endsWith(`.${tailnet}`) ? dnsName.slice(0, -tailnet.length - 1) : dnsName.split('.')[0]!;
    const expiry = s.Self?.KeyExpiry ? Date.parse(s.Self.KeyExpiry) : NaN;
    return {
      kind: 'running',
      tailnet,
      nodeName,
      httpsEnabled: (s.CertDomains?.length ?? 0) > 0,
      keyExpiry: Number.isFinite(expiry) ? expiry : null,
    };
  }
  if (s.BackendState === 'Stopped') return { kind: 'stopped' };
  return { kind: 'needs_login', authUrl: s.AuthURL || null };
}

export class LocalApiTailscale implements TailscaleClient {
  private async transport(): Promise<Transport> {
    const t = await discover();
    if (!t) throw new TailscaleError('unavailable', 'Tailscale LocalAPI not found');
    return t;
  }

  async state(): Promise<TailscaleState> {
    const t = await discover();
    if (!t) return (await installed()) ? { kind: 'stopped' } : { kind: 'not_installed' };
    try {
      return stateFromStatus(JSON.parse(check(await call(t, 'GET', 'status'), 'status').body) as StatusJson);
    } catch (err) {
      // A port or socket left by a Tailscale that has since quit.
      if (err instanceof TailscaleError && err.kind === 'unavailable') return { kind: 'stopped' };
      throw err;
    }
  }

  async login({ hostname }: { hostname: string | null }): Promise<void> {
    const t = await this.transport();
    if (hostname) check(await call(t, 'PATCH', 'prefs', { Hostname: hostname, HostnameSet: true }), 'prefs');
    check(await call(t, 'POST', 'login-interactive'), 'login');
  }

  async serveConfig(): Promise<{ config: ServeConfig; etag: string }> {
    const reply = check(await call(await this.transport(), 'GET', 'serve-config'), 'serve-config');
    return { config: (JSON.parse(reply.body || 'null') as ServeConfig | null) ?? {}, etag: reply.etag ?? '' };
  }

  async setServeConfig(config: ServeConfig, etag: string): Promise<void> {
    check(await call(await this.transport(), 'POST', 'serve-config', config, { 'If-Match': etag }), 'serve-config');
  }
}
