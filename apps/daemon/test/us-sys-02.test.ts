// US-SYS-02 · Connect remote access with Tailscale (server side), with the decisions D-102…D-104: the computer keeps
// its own tailnet name, only hlabs's Serve entries are touched, ports served already are asked about, never Funnel.
import { apps, auditLog, getSetting, setSetting, users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { LOGIN_TIMEOUT_MS } from '../src/network/remote';
import type { FakeTailscale } from '../src/tailscale/fake';
import { stateFromStatus } from '../src/tailscale/localapi';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function setup() {
  const d = await daemonWithAdmin(closers);
  const ts = d.services!.tailscale as FakeTailscale;
  d.services!.db.insert(apps)
    .values({
      id: 'immich',
      version: '1',
      state: 'running',
      hostname: 'immich',
      portFallback: 12001,
      installedAt: 1,
      updatedAt: 1,
    })
    .run();
  const connect = (input: Record<string, unknown> = {}) => d.mutate('network.remote.connect', input);
  const status = async () => (await d.query('network.status')).result!.data.remote as Record<string, unknown>;
  return { d, ts, connect, status };
}

describe('US-SYS-02', () => {
  it('not installed or not running: says so and changes nothing', async () => {
    const { ts, connect, status } = await setup();
    ts.current = { kind: 'not_installed' };
    expect((await connect()).result!.data).toEqual({ state: 'not_installed' });
    expect(await status()).toMatchObject({ state: 'not_installed', url: null });
    ts.current = { kind: 'stopped' };
    expect((await connect()).result!.data).toEqual({ state: 'stopped' });
    expect(ts.logins).toBe(0);
  });

  it('signed out: a log-in that names the computer after the server; once running, hlabs publishes (D-102)', async () => {
    const { d, ts, connect, status } = await setup();
    const res = (await connect()).result!.data;
    expect(res).toEqual({ state: 'needs_login', loginUrl: 'https://login.tailscale.com/a/fake' });
    expect(ts.hostname).toBe('hlabs');
    expect(await status()).toMatchObject({ state: 'waiting', loginUrl: 'https://login.tailscale.com/a/fake' });

    ts.finishLogin('tail1234.ts.net');
    expect(await status()).toMatchObject({
      state: 'connected',
      url: 'https://hlabs.tail1234.ts.net',
      nodeName: 'hlabs',
    });
    expect(ts.config).toEqual({
      TCP: { '443': { HTTPS: true }, '14001': { HTTPS: true } },
      Web: {
        'hlabs.tail1234.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:0' } } },
        'hlabs.tail1234.ts.net:14001': { Handlers: { '/': { Proxy: 'https+insecure://127.0.0.1:12001' } } },
      },
    });
    expect(getSetting(d.services!.db, 'remote')).toMatchObject({
      mode: 'tailscale',
      state: 'connected',
      serve: [443, 14001],
    });
    expect(
      d.services!.db.select().from(auditLog).where(eq(auditLog.action, 'network.remote.connect')).get(),
    ).toBeDefined();
    // The app's tailnet address follows the computer's name.
    const listed = (await d.query('apps.list')).result!.data.apps as Array<{ urls: { tailnet: string | null } }>;
    expect(listed[0]!.urls.tailnet).toBe('https://hlabs.tail1234.ts.net:14001');
  });

  it('already signed in: names the tailnet and waits for a confirmation; the computer keeps its own name', async () => {
    const { ts, connect, status } = await setup();
    ts.current = {
      kind: 'running',
      tailnet: 'tail9.ts.net',
      nodeName: 'hari-home',
      httpsEnabled: true,
      keyExpiry: null,
    };
    expect((await connect()).result!.data).toEqual({
      state: 'confirm',
      tailnet: 'tail9.ts.net',
      nodeName: 'hari-home',
    });
    expect(ts.config).toEqual({});
    expect((await connect({ confirmTailnet: true })).result!.data).toEqual({
      state: 'connected',
      url: 'https://hari-home.tail9.ts.net',
    });
    expect(ts.hostname).toBeNull();
    expect(await status()).toMatchObject({ state: 'connected', nodeName: 'hari-home' });
  });

  it('never replaces Serve entries it did not make: 443 served already is a conflict, 8443 works (D-103)', async () => {
    const { ts, connect } = await setup();
    ts.current = {
      kind: 'running',
      tailnet: 'tail9.ts.net',
      nodeName: 'hari-home',
      httpsEnabled: true,
      keyExpiry: null,
    };
    ts.config = {
      TCP: { '443': { HTTPS: true } },
      Web: { 'hari-home.tail9.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:3000' } } } },
    };
    const clash = await connect({ confirmTailnet: true });
    expect(clash.error?.data).toMatchObject({ hlabsCode: 'TAILSCALE_SERVE_CONFLICT', detail: { port: 443 } });
    expect((await connect({ confirmTailnet: true, dashboardPort: 8443 })).result!.data).toEqual({
      state: 'connected',
      url: 'https://hari-home.tail9.ts.net:8443',
    });
    // Their own entry is still there, untouched.
    expect(ts.config.Web!['hari-home.tail9.ts.net:443']).toEqual({
      Handlers: { '/': { Proxy: 'http://127.0.0.1:3000' } },
    });
    expect(Object.keys(ts.config.TCP!).sort()).toEqual(['14001', '443', '8443']);
  });

  it('never turns on Funnel, and leaves Funnel someone set up alone', async () => {
    const { ts, connect } = await setup();
    ts.current = { kind: 'running', tailnet: 'tail9.ts.net', nodeName: 'n', httpsEnabled: true, keyExpiry: null };
    ts.config = { AllowFunnel: { 'n.tail9.ts.net:10000': true }, TCP: { '10000': { HTTPS: true } } };
    await connect({ confirmTailnet: true });
    expect(ts.config.AllowFunnel).toEqual({ 'n.tail9.ts.net:10000': true });
    expect(JSON.stringify(ts.config)).not.toMatch(/"n\.tail9\.ts\.net:(443|12001)":true/);
  });

  it('a tailnet without HTTPS certificates and a missing Linux operator setting say what to do', async () => {
    const { ts, connect } = await setup();
    ts.current = { kind: 'running', tailnet: 't.ts.net', nodeName: 'n', httpsEnabled: false, keyExpiry: null };
    expect((await connect({ confirmTailnet: true })).error?.data.hlabsCode).toBe('TAILSCALE_HTTPS_DISABLED');
    ts.current = { kind: 'running', tailnet: 't.ts.net', nodeName: 'n', httpsEnabled: true, keyExpiry: null };
    ts.denyWrites = true;
    expect((await connect({ confirmTailnet: true })).error?.data.hlabsCode).toBe('TAILSCALE_PERMISSION_DENIED');
  });

  it('a log-in not finished within 10 minutes is given up', async () => {
    const { d, connect, status } = await setup();
    await connect();
    const { db } = d.services!;
    setSetting(db, 'remote', { ...getSetting(db, 'remote'), connectStartedAt: Date.now() - LOGIN_TIMEOUT_MS - 1 });
    expect(await status()).toMatchObject({ state: 'timed_out' });
    expect(getSetting(db, 'remote')).toMatchObject({ mode: 'off', state: 'off' });
  });

  it('the dashboard on the tailnet is an allowed origin for mutations', async () => {
    const { d, ts, connect } = await setup();
    ts.current = {
      kind: 'running',
      tailnet: 'tail9.ts.net',
      nodeName: 'hari-home',
      httpsEnabled: true,
      keyExpiry: null,
    };
    await connect({ confirmTailnet: true });
    const { dashboardOrigins } = await import('../src/http/dashboard-origins');
    expect(dashboardOrigins('http://127.0.0.1:7474', d.services!.db)).toContain('https://hari-home.tail9.ts.net');
  });

  it('reads the LocalAPI status: DNS name (not the display name), HTTPS, key expiry', () => {
    expect(
      stateFromStatus({
        BackendState: 'Running',
        MagicDNSSuffix: 'tail9.ts.net',
        CertDomains: ['hari-home.tail9.ts.net'],
        Self: { DNSName: 'hari-home.tail9.ts.net.', KeyExpiry: '2027-04-01T00:00:00Z' },
      }),
    ).toEqual({
      kind: 'running',
      tailnet: 'tail9.ts.net',
      nodeName: 'hari-home',
      httpsEnabled: true,
      keyExpiry: Date.parse('2027-04-01T00:00:00Z'),
    });
    expect(stateFromStatus({ BackendState: 'NeedsLogin', AuthURL: 'https://login.tailscale.com/a/x' })).toEqual({
      kind: 'needs_login',
      authUrl: 'https://login.tailscale.com/a/x',
    });
    expect(stateFromStatus({ BackendState: 'Stopped' })).toEqual({ kind: 'stopped' });
  });

  it('members get ACCESS_DENIED', async () => {
    const { d, connect } = await setup();
    d.services!.db.update(users).set({ role: 'member' }).where(eq(users.id, d.userId)).run();
    expect((await connect()).error?.data.hlabsCode).toBe('ACCESS_DENIED');
  });
});
