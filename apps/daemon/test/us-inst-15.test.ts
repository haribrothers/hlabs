// US-INST-15 · Tray authenticates to the daemon with a local token.
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bearerToken,
  ensureTrayTokenFile,
  FileTrayTokenSource,
  FirstTrayTokenSource,
  isLoopback,
  KeychainTrayTokenSource,
  newTrayToken,
  TRAY_TOKEN_FILE,
  trayTokenSource,
  TrayTokens,
  type TrayTokenSource,
} from '../src/auth/tray-token';
import { silentLogger } from '../src/logger';
import { Readiness } from '../src/readiness';
import { buildServer } from '../src/server';
import { ServiceHolder } from '../src/services';
import { readSse, startDaemon, tempDir, testConfig } from './helpers';

const keychain = vi.hoisted(() => new Map<string, string>());
vi.mock('@napi-rs/keyring', () => ({
  Entry: class {
    private readonly id: string;
    constructor(service: string, account: string) {
      this.id = `${service}/${account}`;
    }
    getPassword() {
      return keychain.get(this.id) ?? null;
    }
    setPassword(value: string) {
      keychain.set(this.id, value);
    }
    deleteCredential() {
      return keychain.delete(this.id);
    }
  },
}));

class StaticSource implements TrayTokenSource {
  reads = 0;
  constructor(public token: string | null) {}
  async read() {
    this.reads++;
    return this.token;
  }
}

const TOKEN = newTrayToken();

async function server(source: TrayTokenSource = new StaticSource(TOKEN)) {
  const trayTokens = new TrayTokens(source);
  const app = await buildServer({
    config: testConfig({ devAnonymousAdmin: false }),
    logger: silentLogger(),
    readiness: new Readiness(),
    holder: new ServiceHolder(),
    trayTokens,
  });
  return app;
}

async function call(
  path: string,
  opts: { token?: string; headers?: Record<string, string>; remoteAddress?: string } = {},
) {
  const app = await server();
  try {
    const res = await app.inject({
      method: 'GET' as const,
      url: `/trpc/${path}`,
      remoteAddress: opts.remoteAddress ?? '127.0.0.1',
      headers: { ...(opts.token === undefined ? {} : { authorization: `Bearer ${opts.token}` }), ...opts.headers },
    });
    const body = res.json() as { error?: { data?: { hlabsCode?: string; httpStatus?: number } } };
    return { status: res.statusCode, code: body.error?.data?.hlabsCode ?? null };
  } finally {
    await app.close();
  }
}

describe('US-INST-15 · Tray authenticates to the daemon with a local token', () => {
  afterEach(() => keychain.clear());

  it('makes a token of 32 random bytes, base64url', () => {
    const token = newTrayToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newTrayToken()).not.toBe(token);
  });

  it('reads the token from the keychain item dev.hlabs / tray-token and keeps only its hash', async () => {
    keychain.set('dev.hlabs/tray-token', TOKEN);
    const tokens = new TrayTokens(new KeychainTrayTokenSource());
    await tokens.load();
    expect(await tokens.verify(TOKEN)).toBe(true);
    expect(await tokens.verify(`${TOKEN}x`)).toBe(false);
    // Only the SHA-256 is held, never the token itself.
    expect(JSON.stringify(Object.values(tokens))).not.toContain(TOKEN);
  });

  it('uses the keychain on a desktop install and tray.token in the data dir otherwise (D-112)', () => {
    const dataDir = tempDir();
    const paths = { dataDir, appDataDir: dataDir, storageRootDefault: dataDir };
    expect(trayTokenSource(testConfig({ secretStore: 'keychain', paths }), 'darwin')).toBeInstanceOf(
      KeychainTrayTokenSource,
    );
    const file = trayTokenSource(testConfig({ secretStore: 'file', paths }));
    expect(file).toBeInstanceOf(FileTrayTokenSource);
    expect((file as FileTrayTokenSource).path).toBe(join(dataDir, TRAY_TOKEN_FILE));
  });

  it('on a Linux desktop without Secret Service, falls back to the 0600 file (07 §7.5)', async () => {
    const dataDir = tempDir();
    const paths = { dataDir, appDataDir: dataDir, storageRootDefault: dataDir };
    const source = trayTokenSource(testConfig({ secretStore: 'keychain', paths }), 'linux');
    expect(source).toBeInstanceOf(FirstTrayTokenSource);
    expect(await source.read()).toBeNull();
    writeFileSync(join(dataDir, TRAY_TOKEN_FILE), `${TOKEN}\n`);
    expect(await source.read()).toBe(TOKEN);
    keychain.set('dev.hlabs/tray-token', 'from-keychain');
    expect(await source.read()).toBe('from-keychain');
  });

  it('on headless Linux the daemon creates tray.token (0640) once and never replaces it (D-035)', async () => {
    const dataDir = tempDir();
    const paths = { dataDir, appDataDir: dataDir, storageRootDefault: dataDir };
    const source = trayTokenSource(testConfig({ secretStore: 'file', headless: true, paths }));
    const path = join(dataDir, TRAY_TOKEN_FILE);
    expect(statSync(path).mode & 0o777).toBe(0o640);
    const token = readFileSync(path, 'utf8').trim();
    expect(await source.read()).toBe(token);
    ensureTrayTokenFile(path);
    expect(readFileSync(path, 'utf8').trim()).toBe(token);
  });

  it('accepts the token from loopback on tray procedures', async () => {
    // Reaching the procedure (whatever it answers) means the token was accepted.
    const { code } = await call('tray.status', { token: TOKEN });
    expect(code).not.toBe('TRAY_TOKEN_REJECTED');
    expect(code).not.toBe('ACCESS_DENIED');
    expect(code).not.toBe('AUTH_REQUIRED');
    expect((await call('tray.status', { token: TOKEN, remoteAddress: '::1' })).code).not.toBe('TRAY_TOKEN_REJECTED');
  });

  it('rejects a wrong or empty token with UNAUTHORIZED / TRAY_TOKEN_REJECTED', async () => {
    expect(await call('tray.status', { token: newTrayToken() })).toEqual({ status: 401, code: 'TRAY_TOKEN_REJECTED' });
    expect(await call('tray.status', { token: '' })).toEqual({ status: 401, code: 'TRAY_TOKEN_REJECTED' });
  });

  it('rejects the token through Caddy (any X-Forwarded-* header) or from another address', async () => {
    for (const header of ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto']) {
      expect(await call('tray.status', { token: TOKEN, headers: { [header]: '127.0.0.1' } })).toEqual({
        status: 401,
        code: 'TRAY_TOKEN_REJECTED',
      });
    }
    expect(await call('tray.status', { token: TOKEN, remoteAddress: '192.168.1.20' })).toEqual({
      status: 401,
      code: 'TRAY_TOKEN_REJECTED',
    });
  });

  it('refuses a valid token on any procedure that is not tray.* with FORBIDDEN', async () => {
    expect(await call('users.list', { token: TOKEN })).toEqual({ status: 403, code: 'ACCESS_DENIED' });
    expect(await call('apps.list', { token: TOKEN })).toEqual({ status: 403, code: 'ACCESS_DENIED' });
    expect(await call('onboarding.status', { token: TOKEN })).toEqual({ status: 403, code: 'ACCESS_DENIED' });
  });

  it('picks up a token the tray regenerated, reading the source at most every 5 s (D-112)', async () => {
    let now = 0;
    const source = new StaticSource(TOKEN);
    const tokens = new TrayTokens(source, () => now);
    await tokens.load();
    const next = newTrayToken();
    source.token = next;
    expect(await tokens.verify(next)).toBe(false);
    now = 4_999;
    expect(await tokens.verify(next)).toBe(false);
    expect(source.reads).toBe(1);
    now = 5_000;
    expect(await tokens.verify(next)).toBe(true);
    expect(await tokens.verify(TOKEN)).toBe(false);
  });

  it('a tray with the wrong token makes it read the source less and less often (no keychain prompt every 5 s)', async () => {
    let now = 0;
    const source = new StaticSource(TOKEN);
    const tokens = new TrayTokens(source, () => now);
    await tokens.load();
    const wrong = newTrayToken();
    // Asked every second by a tray holding another token: reads at 5 s, then 15 s (10 s later), then 35 s (20 s).
    for (now = 1_000; now <= 40_000; now += 1_000) await tokens.verify(wrong);
    expect(source.reads).toBe(1 + 3);
    // The right token resets it; a regenerated one is picked up again within 5 s.
    expect(await tokens.verify(TOKEN)).toBe(true);
    const next = newTrayToken();
    source.token = next;
    now += 5_000;
    expect(await tokens.verify(next)).toBe(true);
  });

  it('gives no tray access when the token is missing or unreadable', async () => {
    const tokens = new TrayTokens(new StaticSource(null));
    await tokens.load();
    expect(await tokens.verify('')).toBe(false);
    expect(await tokens.verify(TOKEN)).toBe(false);
    const broken = new TrayTokens({ read: () => Promise.reject(new Error('denied')) });
    await broken.load();
    expect(await broken.verify(TOKEN)).toBe(false);
  });

  it('reads the token file, ignoring a trailing newline', async () => {
    const path = join(tempDir(), TRAY_TOKEN_FILE);
    const source = new FileTrayTokenSource(path);
    expect(await source.read()).toBeNull();
    writeFileSync(path, `${TOKEN}\n`);
    expect(await source.read()).toBe(TOKEN);
  });

  it('parses Bearer headers and loopback addresses', () => {
    expect(bearerToken('Bearer abc')).toBe('abc');
    expect(bearerToken('bearer abc')).toBe('abc');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
    for (const a of ['127.0.0.1', '127.1.2.3', '::1', '::ffff:127.0.0.1']) expect(isLoopback(a)).toBe(true);
    for (const a of ['192.168.1.2', '::ffff:10.0.0.1', '100.64.0.1', '', undefined]) expect(isLoopback(a)).toBe(false);
  });

  describe('the event stream', () => {
    let close: (() => Promise<void>) | undefined;
    afterEach(async () => close?.());

    it('accepts the tray token on events.stream and refuses a wrong one', async () => {
      const d = await startDaemon({
        config: { devAnonymousAdmin: false },
        trayTokens: new TrayTokens(new StaticSource(TOKEN)),
      });
      close = d.close;
      const ok = await fetch(`${d.url}/trpc/events.stream`, {
        headers: { accept: 'text/event-stream', authorization: `Bearer ${TOKEN}` },
      });
      expect(ok.status).toBe(200);
      setTimeout(() => d.services!.bus.emit('startup.changeRequested', { startAtLogin: false }), 100);
      const text = await readSse(ok, (t) => t.includes('startup.changeRequested'));
      expect(text).toContain('startup.changeRequested');

      const bad = await fetch(`${d.url}/trpc/events.stream`, {
        headers: { accept: 'text/event-stream', authorization: `Bearer ${newTrayToken()}` },
      });
      const badText = await readSse(bad, (t) => t.includes('TRAY_TOKEN_REJECTED'));
      expect(bad.status === 401 || badText.includes('TRAY_TOKEN_REJECTED')).toBe(true);
    });
  });
});
