// The real Cloudflare (US-SYS-43, D-171): "Sign in to Cloudflare" runs the bundled `cloudflared tunnel login` with its
// home in the data dir, shows the link it prints, and waits for the origin certificate it writes; hlabs reads the zone,
// account and zone-scoped token out of it, keeps them in the keychain and deletes the file. Everything else is
// Cloudflare's v4 API with that token (or the admin's own): the tunnel, and only the DNS records hlabs made. What
// needs a real domain to confirm is Q-24; tests fake the process and `fetch`.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  CloudflareError,
  type CloudflareClient,
  type CloudflareCredential,
  type CloudflareSignIn,
  type CloudflareStep,
} from './types';

export const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';
/** How long Cloudflare's sign-in may take before hlabs stops waiting. */
export const SIGN_IN_TIMEOUT_MS = 10 * 60_000;
/** How long cloudflared has to print its sign-in link. */
const LINK_TIMEOUT_MS = 30_000;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;
type Spawn = (command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => ChildProcess;

export interface CloudflareApiDeps {
  /** `<binDir>/cloudflared` */
  binary: string;
  /** `<dataDir>/cloudflare`: the sign-in's home (its `.cloudflared/cert.pem` lives here only until read). */
  dir: string;
  fetch?: Fetch;
  spawn?: Spawn;
  /** Cloudflare was contacted (US-SYS-29). */
  onContact?: () => void;
  signInTimeoutMs?: number;
}

/** The zone, account and token in cloudflared's origin certificate (`-----BEGIN ARGO TUNNEL TOKEN-----`). */
export function parseOriginCert(pem: string): { zoneId: string; accountId: string; token: string } | null {
  const block = /-----BEGIN ARGO TUNNEL TOKEN-----([\s\S]+?)-----END ARGO TUNNEL TOKEN-----/.exec(pem)?.[1];
  if (!block) return null;
  try {
    const json = JSON.parse(Buffer.from(block.replace(/\s+/g, ''), 'base64').toString('utf8')) as Record<
      string,
      unknown
    >;
    const zoneId = json.zoneID;
    const accountId = json.accountID;
    const token = json.apiToken;
    if (typeof zoneId !== 'string' || typeof accountId !== 'string' || typeof token !== 'string') return null;
    return { zoneId, accountId, token };
  } catch {
    return null;
  }
}

/** The sign-in link cloudflared prints. */
export function signInLinkIn(text: string): string | null {
  return /https:\/\/dash\.cloudflare\.com\/argotunnel\?\S+/.exec(text)?.[0] ?? null;
}

interface ApiReply<T> {
  success: boolean;
  result: T;
  errors?: Array<{ code: number; message: string }>;
}

export class CloudflareApi implements CloudflareClient {
  constructor(private readonly deps: CloudflareApiDeps) {}

  private async call<T>(
    step: CloudflareStep,
    token: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; reply: ApiReply<T> | null }> {
    let res: Response;
    try {
      res = await (this.deps.fetch ?? fetch)(`${CLOUDFLARE_API}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new CloudflareError(step, `Cloudflare didn't answer (${method} ${path.split('?')[0]})`);
    }
    this.deps.onContact?.();
    const reply = (await res.json().catch(() => null)) as ApiReply<T> | null;
    return { status: res.status, reply };
  }

  /** The result, or a CloudflareError at `step` (the token itself is never in the message). */
  private async ok<T>(step: CloudflareStep, token: string, method: string, path: string, body?: unknown): Promise<T> {
    const { status, reply } = await this.call<T>(step, token, method, path, body);
    if (status >= 200 && status < 300 && reply?.success) return reply.result;
    const codes = (reply?.errors ?? []).map((e) => e.code);
    const message = (reply?.errors ?? []).map((e) => `${e.code} ${e.message}`).join('; ') || `HTTP ${status}`;
    // 1013: a tunnel with that name exists; 81053/81057: a record with that name exists.
    const conflict = status === 409 || codes.some((c) => c === 1013 || c === 81053 || c === 81057);
    throw new CloudflareError(
      status === 401 || status === 403 ? (step === 'zone' ? 'token' : step) : step,
      message,
      conflict,
    );
  }

  async signIn(): Promise<CloudflareSignIn> {
    const home = join(this.deps.dir, 'login');
    const cert = join(home, '.cloudflared', 'cert.pem');
    mkdirSync(join(home, '.cloudflared'), { recursive: true, mode: 0o700 });
    rmSync(cert, { force: true });
    // HOME in the data dir: the certificate never lands in the person's own ~/.cloudflared.
    const child = (this.deps.spawn ?? defaultSpawn)(this.deps.binary, ['tunnel', 'login'], {
      env: { ...process.env, HOME: home, USERPROFILE: home },
    });
    let output = '';
    let cancelled = false;
    const url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new CloudflareError('signIn', "cloudflared didn't print a sign-in link"));
      }, LINK_TIMEOUT_MS);
      const onData = (chunk: Buffer | string) => {
        output = (output + chunk.toString()).slice(-8_000);
        const link = signInLinkIn(output);
        if (link) {
          clearTimeout(timer);
          resolve(link);
        }
      };
      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);
      child.once('error', (err) => {
        clearTimeout(timer);
        reject(new CloudflareError('signIn', `cloudflared couldn't start: ${err.message}`));
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new CloudflareError('signIn', `cloudflared stopped before signing in (${code})`));
      });
    });
    const done = new Promise<CloudflareCredential>((resolve, reject) => {
      const timer = setTimeout(() => child.kill('SIGTERM'), this.deps.signInTimeoutMs ?? SIGN_IN_TIMEOUT_MS);
      timer.unref();
      const finish = async () => {
        clearTimeout(timer);
        const pem = existsSync(cert) ? readFileSync(cert, 'utf8') : null;
        // The certificate holds a token: it goes to the keychain, never stays on disk.
        rmSync(cert, { force: true });
        if (cancelled) return reject(new CloudflareError('signIn', 'cancelled'));
        const parsed = pem ? parseOriginCert(pem) : null;
        if (!parsed) return reject(new CloudflareError('signIn', "Cloudflare's sign-in didn't finish"));
        try {
          const zone = await this.ok<{ name: string }>('zone', parsed.token, 'GET', `/zones/${parsed.zoneId}`);
          resolve({
            kind: 'signIn',
            token: parsed.token,
            zoneId: parsed.zoneId,
            accountId: parsed.accountId,
            domain: zone.name,
          });
        } catch (err) {
          reject(err);
        }
      };
      child.once('exit', () => void finish());
    });
    done.catch(() => {});
    return {
      url,
      done,
      cancel: () => {
        cancelled = true;
        child.kill('SIGTERM');
      },
    };
  }

  async checkToken(token: string, domain: string): Promise<CloudflareCredential> {
    const zones = await this.ok<Array<{ id: string; name: string; account: { id: string } }>>(
      'token',
      token,
      'GET',
      `/zones?name=${encodeURIComponent(domain)}`,
    );
    const zone = zones.find((z) => z.name === domain);
    if (!zone) throw new CloudflareError('zone', `The token doesn't cover ${domain}`);
    return { kind: 'token', token, zoneId: zone.id, accountId: zone.account.id, domain: zone.name };
  }

  async createTunnel(cred: CloudflareCredential, name: string) {
    const secret = randomBytes(32).toString('base64');
    const create = (tunnelName: string) =>
      this.ok<{ id: string }>('tunnel', cred.token, 'POST', `/accounts/${cred.accountId}/cfd_tunnel`, {
        name: tunnelName,
        tunnel_secret: secret,
        config_src: 'local',
      });
    let tunnel: { id: string };
    try {
      tunnel = await create(name);
    } catch (err) {
      // A tunnel of that name exists already (another hlabs on the account): a name of its own.
      if (!(err instanceof CloudflareError && err.conflict)) throw err;
      tunnel = await create(`${name}-${randomBytes(3).toString('hex')}`);
    }
    return {
      tunnelId: tunnel.id,
      credentials: { AccountTag: cred.accountId, TunnelSecret: secret, TunnelID: tunnel.id },
    };
  }

  async deleteTunnel(cred: CloudflareCredential, tunnelId: string) {
    const base = `/accounts/${cred.accountId}/cfd_tunnel/${tunnelId}`;
    // Its connections first (the connector has stopped; Cloudflare may still list it for a moment).
    await this.call('remove', cred.token, 'DELETE', `${base}/connections`);
    const { status, reply } = await this.call('remove', cred.token, 'DELETE', base);
    if (status === 404 || (status < 300 && reply?.success)) return;
    throw new CloudflareError('remove', (reply?.errors ?? []).map((e) => e.message).join('; ') || `HTTP ${status}`);
  }

  async nameTaken(cred: CloudflareCredential, name: string) {
    const records = await this.ok<unknown[]>(
      'dns',
      cred.token,
      'GET',
      `/zones/${cred.zoneId}/dns_records?name=${encodeURIComponent(name)}`,
    );
    return records.length > 0;
  }

  async addRecord(cred: CloudflareCredential, name: string, tunnelId: string) {
    const record = await this.ok<{ id: string }>('dns', cred.token, 'POST', `/zones/${cred.zoneId}/dns_records`, {
      type: 'CNAME',
      name,
      content: `${tunnelId}.cfargotunnel.com`,
      proxied: true,
      ttl: 1,
      comment: 'Made by hlabs for a public app; hlabs deletes it when the app is private.',
    });
    return { id: record.id };
  }

  async deleteRecord(cred: CloudflareCredential, recordId: string) {
    const { status, reply } = await this.call(
      'dns',
      cred.token,
      'DELETE',
      `/zones/${cred.zoneId}/dns_records/${recordId}`,
    );
    if (status === 404 || (status < 300 && reply?.success)) return;
    throw new CloudflareError('dns', (reply?.errors ?? []).map((e) => e.message).join('; ') || `HTTP ${status}`);
  }
}

const defaultSpawn: Spawn = (command, args, options) =>
  spawn(command, args, { env: options.env, stdio: ['ignore', 'pipe', 'pipe'] });
