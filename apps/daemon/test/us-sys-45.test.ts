// US-SYS-45 · Make the dashboard public (D-182, 07 §7.11): off by default; an admin makes it public at a name of its own
// under the domain, with their password, only while every admin has two-factor; a DNS record hlabs made, Caddy's
// public listener serving the dashboard there with `X-Hlabs-Via: public` (and every other server deleting it), audited
// and told to the other admins; Make private ends every session there; Turn off all, the menu bar and removing the
// tunnel make it private too. And the real Caddy (when `pnpm fetch-binaries` has put it in .bin): the header set on the
// public dashboard only, deleted on the home servers, the public hardening and the paths it never passes on.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { request } from 'node:https';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { LOOPBACK_OFFSET } from '../src/apps/ports';
import { buildCaddyConfig, caRootDir } from '../src/caddy/config';
import type { ProxyState } from '../src/caddy/index';
import { CaddyProxy } from '../src/caddy/proxy';
import { DASHBOARD_REFUSED_PATHS, PUBLIC_ORIGIN_NAME } from '../src/caddy/public';
import { DaemonContext } from '../src/context';
import { dashboardOrigins } from '../src/http/dashboard-origins';
import { silentLogger } from '../src/logger';
import { dispatcher } from '../src/routers/index';
import type { Reply } from './admin-session';
import { tempDir } from './helpers';
import { DASH, DASH_ORIGIN, publicDashboardFixture, type PublicDashboardFixture } from './public-dashboard-fixture';
import { PASSWORD } from './public-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Status = {
  dashboard: { address: string; hostname: string; since: number; by: string | null; cloudflareAccess: unknown } | null;
  dashboardBlockedBy: string[];
};
const status = async (t: PublicDashboardFixture) => (await t.d.query('public.status')).result!.data as Status;

/** A tray call with its token (checked by DaemonContext.authorize). */
async function asTray(t: PublicDashboardFixture, path: string) {
  const ctx = new DaemonContext(
    t.d.holder,
    dispatcher,
    { kind: 'tray' },
    {
      ip: '127.0.0.1',
      userAgent: null,
      setupToken: null,
      csrfToken: null,
      origin: null,
      host: null,
      allowedOrigins: [],
      via: 'home',
      publicHost: null,
      country: null,
      setCookie: () => {},
    },
  );
  ctx.authorize(['tray'], path);
  return ctx.handle(path, undefined, undefined);
}

describe('US-SYS-45', () => {
  it("is off by default on every install: no address, no route, nothing in Cloudflare's DNS", async () => {
    const t = await publicDashboardFixture(closers, { makePublic: false });
    expect(await status(t)).toMatchObject({ dashboard: null, dashboardBlockedBy: [] });
    expect(t.listener()).toMatchObject({ dashboard: null });
    expect(t.fake.hlabsRecords()).toEqual([]);
    expect(await asTray(t, 'tray.status')).toMatchObject({ publicDashboard: false });
  });

  it('needs Cloudflare Tunnel set up first', async () => {
    const t = await publicDashboardFixture(closers, { setUp: false });
    const { reply } = await t.setDashboard();
    expect(reply.error?.data.hlabsCode).toBe('PUBLIC_NOT_SET_UP');
  });

  it('asks for the password again, with the log-in lockout', async () => {
    const t = await publicDashboardFixture(closers, { makePublic: false });
    expect((await t.setDashboard({ public: true })).reply.error?.data).toMatchObject({
      hlabsCode: 'VALIDATION_FAILED',
      detail: { field: 'password' },
    });
    expect((await t.setDashboard({ public: true, password: 'wrong password!' })).reply.error?.data.hlabsCode).toBe(
      'AUTH_INVALID_PASSWORD',
    );
    expect(t.fake.hlabsRecords()).toEqual([]);
  });

  it('is refused while an admin has no two-factor, naming who; members without it do not block it', async () => {
    const t = await publicDashboardFixture(closers, { makePublic: false });
    await t.person({ username: 'ravi', role: 'member', totp: false });
    expect((await status(t)).dashboardBlockedBy).toEqual([]);
    await t.person({ username: 'asha', role: 'admin', totp: false });
    expect((await status(t)).dashboardBlockedBy).toEqual(['Anu']);
    const { reply } = await t.setDashboard();
    expect(reply.error?.data).toMatchObject({
      hlabsCode: 'TWO_FACTOR_REQUIRED_FOR_DASHBOARD',
      detail: { admins: ['Anu'] },
    });
    expect(t.fake.hlabsRecords()).toEqual([]);
  });

  it('makes it public at hlabs.<domain>: a record hlabs made, the route, the row, audited, the other admins told', async () => {
    const t = await publicDashboardFixture(closers, { makePublic: false });
    const asha = await t.person({ username: 'asha', role: 'admin' });
    const { reply, job } = await t.setDashboard();
    expect(reply.result).toBeTruthy();
    expect(job).toMatchObject({ kind: 'dashboard_public_on', state: 'succeeded' });
    expect(t.fake.hlabsRecords()).toEqual([DASH]);
    expect(t.listener()).toMatchObject({ dashboard: { hostname: DASH } });
    expect((await status(t)).dashboard).toEqual({
      address: DASH_ORIGIN,
      hostname: DASH,
      since: expect.any(Number),
      by: 'Hari',
      cloudflareAccess: null,
    });
    expect(t.audits('dashboard.public.on')).toEqual([
      expect.objectContaining({ userId: t.d.userId, detailJson: { address: DASH_ORIGIN } }),
    ]);
    expect(t.notes('dashboard.public_on')).toEqual([
      expect.objectContaining({
        userId: asha.userId,
        severity: 'info',
        title: `Hari made the dashboard public at ${DASH_ORIGIN}`,
      }),
    ]);
    expect(t.notes('dashboard.public_on').filter((n) => n.userId === t.d.userId)).toEqual([]);
    // The dashboard's origins (CSRF) gain the public address while it's public.
    expect(dashboardOrigins('http://127.0.0.1:7474', t.s.db, () => [])).toContain(DASH_ORIGIN);
    expect(await asTray(t, 'tray.status')).toMatchObject({ publicDashboard: true });
  });

  it('takes another name under the domain, but never one in use: the zone’s own, or a public app’s', async () => {
    const t = await publicDashboardFixture(closers, { makePublic: false });
    expect(
      (await t.setDashboard({ public: true, hostname: 'www', password: PASSWORD })).reply.error?.data,
    ).toMatchObject({ hlabsCode: 'PUBLIC_HOSTNAME_TAKEN', detail: { hostname: 'www.example.com' } });
    await t.setPublic({ hostname: 'vault' });
    expect(
      (await t.setDashboard({ public: true, hostname: 'vault', password: PASSWORD })).reply.error?.data.hlabsCode,
    ).toBe('PUBLIC_HOSTNAME_TAKEN');
    const { job } = await t.setDashboard({ public: true, hostname: 'home', password: PASSWORD });
    expect(job?.state).toBe('succeeded');
    expect((await status(t)).dashboard?.address).toBe('https://home.example.com');
    // …and an app can't take the dashboard's name, which "Make public…" lists as taken.
    const options = (await t.d.query(`apps.publicOptions?input=${encodeURIComponent('{"appId":"vaultwarden"}')}`))
      .result!.data as { taken: string[] };
    expect(options.taken).toContain('home');
    const { reply } = await t.setPublic({ hostname: 'home' });
    expect(reply.error?.data.hlabsCode).toBe('PUBLIC_HOSTNAME_TAKEN');
  });

  it("refuses another name while it's public (make it private first)", async () => {
    const t = await publicDashboardFixture(closers);
    const { reply } = await t.setDashboard({ public: true, hostname: 'other', password: PASSWORD });
    expect(reply.error?.data).toMatchObject({ hlabsCode: 'VALIDATION_FAILED', detail: { field: 'hostname' } });
  });

  it('Make private: the route goes, every session there ends, the record is deleted, audited, others told', async () => {
    const t = await publicDashboardFixture(closers);
    const asha = await t.person({ username: 'asha', role: 'admin' });
    const { cookie } = await t.signInPublic();
    expect(cookie).toBeTruthy();
    // No password needed to make it private.
    const { job } = await t.setDashboard({ public: false });
    expect(job).toMatchObject({ kind: 'dashboard_public_off', state: 'succeeded' });
    expect(t.listener()).toMatchObject({ dashboard: null });
    expect(t.fake.hlabsRecords()).toEqual([]);
    expect(t.sessionRows().filter((s) => s.publicHost === DASH && s.revokedAt === null)).toEqual([]);
    expect((await t.pubQuery('auth.me', undefined, { cookie })).error?.data.hlabsCode).toBe('AUTH_REQUIRED');
    expect(t.audits('dashboard.public.off')).toEqual([
      expect.objectContaining({ detailJson: { address: DASH_ORIGIN, why: 'private' } }),
    ]);
    expect(t.notes('dashboard.public_off')).toEqual([
      expect.objectContaining({ userId: asha.userId, title: 'Hari made the dashboard private' }),
    ]);
    expect((await status(t)).dashboard).toBeNull();
  });

  it('can be made private from the public address itself, which ends my own session there', async () => {
    const t = await publicDashboardFixture(closers);
    const { cookie, csrf } = await t.signInPublic();
    const reply = await t.pubMutate('public.setDashboard', { public: false }, { cookie, csrf });
    expect(reply.result).toBeTruthy();
    await t.s.jobs.settled(reply.result!.data.jobId as string);
    expect((await status(t)).dashboard).toBeNull();
    expect((await t.pubQuery('auth.me', undefined, { cookie })).error?.data.hlabsCode).toBe('AUTH_REQUIRED');
  });

  it('"Turn off all public access" and the menu bar make it private along with the apps', async () => {
    const t = await publicDashboardFixture(closers);
    await t.setPublic();
    expect(await asTray(t, 'tray.status')).toMatchObject({ publicDashboard: true, publicApps: 1 });
    const { jobId } = (await asTray(t, 'tray.publicOff')) as { jobId: string };
    await t.s.jobs.settled(jobId);
    expect(await asTray(t, 'tray.status')).toMatchObject({ publicDashboard: false, publicApps: 0 });
    expect(t.fake.hlabsRecords()).toEqual([]);
    expect(t.audits('dashboard.public.off')).toEqual([
      expect.objectContaining({ detailJson: expect.objectContaining({ why: 'all' }) }),
    ]);
    expect(t.audits('public.turnedOffAll')).toEqual([
      expect.objectContaining({ detailJson: { apps: ['vaultwarden'], dashboard: true, via: 'tray' } }),
    ]);
    expect(t.notes('public.turned_off')).toEqual([
      expect.objectContaining({
        title: 'Public access was turned off from the menu bar',
        body: 'The dashboard and 1 app are private now. Cloudflare Tunnel stays set up.',
      }),
    ]);

    // From the dashboard too.
    await t.setDashboard();
    const reply = (await t.d.mutate('public.turnOffAll')) as Reply;
    await t.s.jobs.settled(reply.result!.data.jobId as string);
    expect((await status(t)).dashboard).toBeNull();
  });

  it('removing Cloudflare Tunnel makes it private first', async () => {
    const t = await publicDashboardFixture(closers);
    const reply = (await t.d.mutate('public.remove')) as Reply;
    expect((await t.s.jobs.settled(reply.result!.data.jobId as string))?.state).toBe('succeeded');
    expect(t.audits('dashboard.public.off')).toEqual([
      expect.objectContaining({ detailJson: { address: DASH_ORIGIN, why: 'remove' } }),
    ]);
    expect(t.fake.hlabsRecords()).toEqual([]);
    expect((await status(t)).dashboard).toBeNull();
  });

  it("members can't make it public or private", async () => {
    const t = await publicDashboardFixture(closers, { makePublic: false });
    const anu = await t.person();
    expect((await anu.mutate('public.setDashboard', { public: true, password: PASSWORD })).error?.data.hlabsCode).toBe(
      'ACCESS_DENIED',
    );
    await expect(
      t.s.publicApps.setDashboard({ userId: anu.userId, role: 'member' }, { public: false }),
    ).rejects.toThrow('ACCESS_DENIED');
  });

  it('the job checks two-factor again: an admin without it, by the time it runs, stops it', async () => {
    const t = await publicDashboardFixture(closers, { makePublic: false });
    await t.person({ role: 'admin', totp: false });
    // As the dev route starts it, without setDashboard's own checks.
    const { jobId } = await t.s.publicApps.setDashboardForDev({ userId: t.d.userId, role: 'admin' }, 'hlabs');
    expect(await t.s.jobs.settled(jobId)).toMatchObject({
      state: 'failed',
      hlabsCode: 'TWO_FACTOR_REQUIRED_FOR_DASHBOARD',
    });
    expect(t.fake.hlabsRecords()).toEqual([]);
  });

  it("the public listener's config: the dashboard there sets X-Hlabs-Via; every other server deletes it", async () => {
    const t = await publicDashboardFixture(closers);
    const state = { ...(t.s.proxy as unknown as { last: ProxyState }).last, dashboardUpstream: '127.0.0.1:5173' };
    const config = buildCaddyConfig(state, {
      storageDir: '/tmp/s',
      adminSocket: '/tmp/a.sock',
      logFile: '/tmp/c.log',
      webFallbackDir: '/tmp/f',
    });
    const json = JSON.stringify(config.apps.http.servers.public);
    const route = config.apps.http.servers.public!.routes.find((r) =>
      JSON.stringify((r as { match?: unknown }).match ?? '').includes(DASH),
    )!;
    const text = JSON.stringify(route);
    expect(text).toContain('"X-Hlabs-Via":["public"]');
    expect(text).toContain('"X-Hlabs-Public-Host":["{http.request.host}"]');
    // To the dashboard's upstream (Vite under dev:full), refusing forward auth, the apps' sign-in and dev routes.
    expect(text).toContain('127.0.0.1:5173');
    for (const path of DASHBOARD_REFUSED_PATHS) expect(text).toContain(path);
    expect(json).toContain('max_size');
    // Every home server deletes it: the dashboard, every app and the plain-HTTP server.
    const https = JSON.stringify(config.apps.http.servers.https);
    expect(https).not.toContain('"X-Hlabs-Via":["public"]');
    expect(https.match(/"delete":\["X-Hlabs-User","X-Hlabs-Role","X-Hlabs-Public-Host","X-Hlabs-Via"\]/g)?.length).toBe(
      1 + state.apps.length,
    );
  });
});

const CADDY = fileURLToPath(new URL('../../../.bin/caddy', import.meta.url));

describe.skipIf(!existsSync(CADDY))('US-SYS-45 · the real Caddy: X-Hlabs-Via only from the public dashboard', () => {
  const servers: Server[] = [];
  let proxy: CaddyProxy;
  let publicPort: number;
  let httpsPort: number;
  const daemonSaw: Array<{ url: string; headers: IncomingMessage['headers'] }> = [];
  const appSaw: Array<{ url: string; headers: IncomingMessage['headers'] }> = [];
  let ca = '';

  async function serve(handler: (req: IncomingMessage, res: ServerResponse) => void) {
    const server = createServer(handler);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    servers.push(server);
    return (server.address() as AddressInfo).port;
  }
  async function freePort() {
    const server = createServer();
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    await new Promise((r) => server.close(r));
    return port;
  }
  function send(
    port: number,
    servername: string,
    host: string,
    path: string,
    headers: Record<string, string> = {},
    method = 'GET',
  ): Promise<{ status: number; headers: IncomingMessage['headers']; body: string }> {
    return new Promise((resolve, reject) => {
      const req = request(
        { host: '127.0.0.1', port, path, method, headers: { Host: host, ...headers }, agent: false, servername, ca },
        (res) => {
          let body = '';
          res.on('data', (c: Buffer) => (body += c.toString()));
          res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }));
        },
      );
      req.on('error', reject);
      req.end();
    });
  }
  /** As cloudflared reaches the public listener. */
  const viaPublic = (host: string, path: string, headers: Record<string, string> = {}, method = 'GET') =>
    send(publicPort, PUBLIC_ORIGIN_NAME, host, path, headers, method);
  /** As a browser at home reaches the home HTTPS server. */
  const atHome = (host: string, path: string, headers: Record<string, string> = {}) =>
    send(httpsPort, host, host, path, headers);

  beforeAll(async () => {
    const dir = tempDir();
    const fallback = join(dir, 'fallback');
    mkdirSync(fallback);
    writeFileSync(join(fallback, 'index.html'), '<h1>fallback</h1>');
    const daemonPort = await serve((req, res) => {
      daemonSaw.push({ url: req.url!, headers: req.headers });
      if (req.url!.startsWith('/auth/verify')) {
        res.setHeader('X-Hlabs-User', 'hari');
        res.setHeader('X-Hlabs-Role', 'admin');
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`dashboard ${req.method} ${req.url}`);
    });
    const appPort = await serve((req, res) => {
      appSaw.push({ url: req.url!, headers: req.headers });
      res.end(`app ${req.url}`);
    });
    publicPort = await freePort();
    httpsPort = await freePort();
    const state: ProxyState = {
      hostname: 'hlabs',
      ports: { https: httpsPort, http: await freePort() },
      onboardingComplete: true,
      dashboardUpstream: `127.0.0.1:${daemonPort}`,
      daemon: `127.0.0.1:${daemonPort}`,
      tailnetHost: null,
      lanAddresses: [],
      apps: [{ appId: 'notes', hostname: 'notes', port: appPort - LOOPBACK_OFFSET, auth: 'hlabs', embed: false }],
      public: {
        port: publicPort,
        logDir: join(dir, 'logs', 'public'),
        apps: [
          {
            appId: 'notes',
            hostname: 'notes.example.com',
            port: appPort - LOOPBACK_OFFSET,
            access: 'ownLogin',
            maxBodyMb: 10,
          },
        ],
        dashboard: { hostname: DASH },
      },
    };
    proxy = new CaddyProxy({
      binary: CADDY,
      dir: join(dir, 'caddy'),
      webFallbackDir: fallback,
      logger: silentLogger(),
    });
    await proxy.apply(state);
    const root = join(caRootDir(proxy.paths.storageDir), 'root.crt');
    for (let i = 0; i < 100 && !existsSync(root); i++) await new Promise((r) => setTimeout(r, 100));
    ca = readFileSync(root, 'utf8');
    // Both listeners' certificates are made as Caddy starts.
    for (const probe of [() => viaPublic('nope.example.com', '/'), () => atHome('hlabs.local', '/healthz')]) {
      for (let i = 0; i < 75; i++) {
        if (
          await probe().then(
            () => true,
            () => false,
          )
        )
          break;
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }, 40_000);

  afterAll(async () => {
    await proxy?.stop();
    for (const s of servers) s.close();
  });

  it('serves the dashboard on its public name, marking every request X-Hlabs-Via: public, whatever the client sent', async () => {
    const res = await viaPublic(DASH, '/trpc/auth.me', {
      'X-Hlabs-Via': 'home',
      'X-Hlabs-Public-Host': 'evil.example.com',
      'X-Hlabs-User': 'evil',
      'CF-Connecting-IP': '198.51.100.7',
      'X-Forwarded-For': '10.0.0.9',
    });
    expect(res.status).toBe(200);
    expect(res.body).toBe('dashboard GET /trpc/auth.me');
    const seen = daemonSaw.at(-1)!;
    expect(seen.headers['x-hlabs-via']).toBe('public');
    expect(seen.headers['x-hlabs-public-host']).toBe(DASH);
    expect(seen.headers['x-hlabs-user']).toBeUndefined();
    expect(seen.headers['x-forwarded-for']).toBe('198.51.100.7');
    expect(seen.headers['x-forwarded-proto']).toBe('https');
    // The upstream gets its own address as Host (the dev server refuses names it doesn't know), the public name in
    // X-Forwarded-Host, which is what the daemon reads.
    expect(seen.headers.host).toMatch(/^127\.0\.0\.1:\d+$/);
    expect(seen.headers['x-forwarded-host']).toBe(DASH);
    // The public hardening on every answer.
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('never passes on forward auth, the public apps’ sign-in, the dev routes or the CA certificate', async () => {
    const before = daemonSaw.length;
    for (const path of ['/auth/verify', '/auth/public-verify', '/.hlabs/sign-in', '/dev/cloudflare', '/ca.crt'])
      expect((await viaPublic(DASH, path)).status, path).toBe(404);
    expect(daemonSaw.length).toBe(before);
  });

  it('sends a page visited over plain HTTP to https://, and refuses anything else (D-181)', async () => {
    const page = await viaPublic(DASH, '/files', { 'X-Forwarded-Proto': 'http' });
    expect(page.status).toBe(308);
    expect(page.headers.location).toBe(`${DASH_ORIGIN}/files`);
    expect((await viaPublic(DASH, '/trpc/auth.login', { 'X-Forwarded-Proto': 'http' }, 'POST')).status).toBe(403);
  });

  it('deletes X-Hlabs-Via on the home dashboard, so nobody at home can pass as the internet (or claim home there)', async () => {
    const res = await atHome('hlabs.local', '/trpc/auth.me', {
      'X-Hlabs-Via': 'public',
      'X-Hlabs-Public-Host': DASH,
    });
    expect(res.body).toBe('dashboard GET /trpc/auth.me');
    const seen = daemonSaw.at(-1)!;
    expect(seen.headers['x-hlabs-via']).toBeUndefined();
    expect(seen.headers['x-hlabs-public-host']).toBeUndefined();
  });

  it("deletes it on an app's route at home too, before forward auth asks the daemon", async () => {
    const res = await atHome('notes.hlabs.local', '/note', { 'X-Hlabs-Via': 'public' });
    expect(res.body).toBe('app /note');
    const verify = daemonSaw.filter((r) => r.url === '/auth/verify').at(-1)!;
    expect(verify.headers['x-hlabs-via']).toBeUndefined();
    expect(appSaw.at(-1)!.headers['x-hlabs-via']).toBeUndefined();
  });

  it("deletes it on a public app's address", async () => {
    const res = await viaPublic('notes.example.com', '/shared', { 'X-Hlabs-Via': 'public' });
    expect(res.body).toBe('app /shared');
    expect(appSaw.at(-1)!.headers['x-hlabs-via']).toBeUndefined();
  });

  it('answers 404 for the dashboard on any other name on the public listener', async () => {
    const before = daemonSaw.length;
    expect((await viaPublic('hlabs.local', '/trpc/auth.me', { 'X-Hlabs-Via': 'public' })).status).toBe(404);
    expect(daemonSaw.length).toBe(before);
  });
});
