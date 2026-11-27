// US-APP-28 · Choose who gets into a public app: hlabs's login on the public address itself (D-178) — two steps,
// the Origin check, two-factor for everyone, the "no access" page, a session for that address only — or the app's own
// login only (`public.ownLoginSafe`, "I understand"); changes audited and told to the other admins. And Caddy's public
// listener: only the app's own web service, 404 for other names, HTTPS only, the headers, cloudflared as the only
// trusted proxy, identity headers from forward auth only and hlabs's cookies never passed on (the real Caddy, when
// `pnpm fetch-binaries` has put it in .bin).
import { sessions } from '@hlabs/db';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { request } from 'node:https';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSync } from 'otplib';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { LOOPBACK_OFFSET } from '../src/apps/ports';
import { buildCaddyConfig, caRootDir } from '../src/caddy/config';
import type { ProxyState } from '../src/caddy/index';
import { CaddyProxy } from '../src/caddy/proxy';
import { PUBLIC_ORIGIN_NAME, stripHlabsCookies } from '../src/caddy/public';
import { publicNext } from '../src/http/public';
import { silentLogger } from '../src/logger';
import { readVisits } from '../src/public/visits';
import type { Reply } from './admin-session';
import { tempDir } from './helpers';
import { memberSession } from './member-session';
import { HOST, PASSWORD, pageData, publicFixture } from './public-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const OWN_LOGIN_SAFE = 'public:\n  ownLoginSafe: true\n';

describe('US-APP-28', () => {
  it('offers "<App>\'s own login only" only when the manifest says it\'s safe, and only with "I understand"', async () => {
    const t = await publicFixture(closers);
    const unsafe = await t.setPublic({ access: 'ownLogin', understood: true });
    expect(unsafe.reply.error?.data).toMatchObject({ hlabsCode: 'PUBLIC_NOT_ALLOWED', detail: { access: 'ownLogin' } });

    const safe = await publicFixture(closers, { extra: OWN_LOGIN_SAFE });
    expect((await safe.d.query('apps.publicOptions', { appId: 'vaultwarden' })).result!.data.ownLoginSafe).toBe(true);
    const unticked = await safe.setPublic({ access: 'ownLogin' });
    expect(unticked.reply.error?.data.hlabsCode).toBe('VALIDATION_FAILED');
    const ticked = await safe.setPublic({ access: 'ownLogin', understood: true });
    expect(ticked.job?.state).toBe('succeeded');
    expect(safe.listener()!.apps[0]).toMatchObject({ access: 'ownLogin' });
    // No hlabs login in front: forward auth lets everything through, and there's no sign-in page.
    expect((await safe.verify()).status).toBe(200);
    expect((await safe.page('GET', '/.hlabs/sign-in')).status).toBe(404);
  });

  it('a visitor who is not signed in is sent to sign in on the address itself, with where they were going', async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    const page = await t.verify({ uri: '/vault?x=1' });
    expect(page.status).toBe(302);
    expect(page.headers.get('location')).toBe(`/.hlabs/sign-in?next=${encodeURIComponent('/vault?x=1')}`);
    // Not a page (an app's API): 401, not a redirect.
    expect((await t.verify({ accept: 'application/json' })).status).toBe(401);
  });

  it('signs in with the password, then the two-factor code, on a typed UTF-8 page, and sets a host-only cookie', async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    const get = await t.page('GET', '/.hlabs/sign-in?next=/vault');
    expect(get.status).toBe(200);
    expect(get.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(get.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(get.headers.get('cache-control')).toBe('no-store');
    expect(get.headers.get('x-frame-options')).toBe('DENY');
    expect(pageData(await get.text())).toMatchObject({
      kind: 'publicSignIn',
      step: 'password',
      appName: 'Vaultwarden',
      host: HOST,
      next: '/vault',
      error: null,
    });

    const { data, second, setCookie, cookie } = await t.signIn({ next: '/vault' });
    expect(data).toMatchObject({ step: 'code', username: 'hari', challenge: expect.any(String) });
    expect(second!.status).toBe(303);
    expect(second!.headers.get('location')).toBe('/vault');
    expect(setCookie).toMatch(/^__Host-hlabs_pub=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
    expect(setCookie).not.toMatch(/Domain=/i);
    const ok = await t.verify({ cookie: cookie! });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('x-hlabs-user')).toBe('hari');
    expect(ok.headers.get('x-hlabs-role')).toBe('admin');
    // Signed in already: the sign-in page goes straight on.
    expect((await t.page('GET', '/.hlabs/sign-in?next=/x', { cookie: cookie! })).headers.get('location')).toBe('/x');
  });

  it('refuses a sign-in posted from anywhere but the public address (Origin)', async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    const form = { username: 'hari', password: PASSWORD };
    for (const origin of [
      null,
      'https://evil.example',
      'null',
      'http://vaultwarden.example.com',
      'https://hlabs.local',
    ]) {
      const res = await t.page('POST', '/.hlabs/sign-in', { form, origin });
      expect(res.status, String(origin)).toBe(403);
    }
    expect(
      t.s.db
        .select()
        .from(sessions)
        .all()
        .filter((s) => s.publicHost),
    ).toEqual([]);
  });

  it('a wrong password or code says so, and counts toward the lockout like the dashboard', async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    const wrong = await t.page('POST', '/.hlabs/sign-in', { form: { username: 'hari', password: 'nope' } });
    expect(wrong.status).toBe(401);
    expect(pageData(await wrong.text())).toMatchObject({ step: 'password', error: 'invalid', username: 'hari' });
    const first = await t.page('POST', '/.hlabs/sign-in', { form: { username: 'hari', password: PASSWORD } });
    const data = pageData(await first.text());
    const badCode = await t.page('POST', '/.hlabs/sign-in', {
      form: { challenge: data.challenge as string, code: '000000' },
    });
    expect(badCode.status).toBe(401);
    expect(pageData(await badCode.text())).toMatchObject({ step: 'code', error: 'invalid', challenge: data.challenge });
    expect(t.audits('auth.login.failed')).toHaveLength(2);
  });

  it('a session signed in on the public address counts there only: not on another, not on the dashboard', async () => {
    const t = await publicFixture(closers, { extra: OWN_LOGIN_SAFE });
    await t.setPublic();
    const { cookie } = await t.signIn();
    const raw = cookie!.split('=')[1]!;
    // Another public address (made public as another app would be) doesn't know it.
    expect((await t.verify({ cookie: cookie!, host: 'photos.example.com' })).status).toBe(404);
    // As the dashboard's cookie, it's nobody.
    const me = await fetch(`${t.d.url}/trpc/auth.me`, { headers: { cookie: `hlabs_session=${raw}` } });
    expect(((await me.json()) as Reply).error?.data.hlabsCode).toBe('AUTH_REQUIRED');
    // Nor on the app's home address.
    const home = await fetch(`${t.d.url}/auth/verify`, {
      headers: {
        'x-forwarded-host': 'vaultwarden.hlabs.local',
        accept: 'application/json',
        cookie: `hlabs_session=${raw}`,
      },
    });
    expect(home.status).toBe(401);
    // A dashboard session isn't let in on the public address either.
    expect((await t.verify({ cookie: `__Host-hlabs_pub=${t.d.cookie.split('=')[1]}` })).status).toBe(302);
    // Listed with Hari's other sessions, and revocable there.
    const listed = (
      (await t.d.query('auth.listSessions')).result!.data as {
        items: Array<{ id: string; current: boolean; publicHost: string | null }>;
      }
    ).items;
    const pub = listed.find((s) => s.publicHost === HOST)!;
    expect(pub).toBeDefined();
    expect(listed.find((s) => s.current)!.publicHost).toBeNull();
    await t.d.mutate('auth.revokeSession', { sessionId: pub.id });
    expect((await t.verify({ cookie: cookie! })).status).toBe(302);
  });

  it('everyone needs two-factor: without it, "Turn on two-factor login first" and no session', async () => {
    const t = await publicFixture(closers);
    const anu = await memberSession(t.d, { appIds: ['vaultwarden'] });
    // Anu has no two-factor yet: the dialog says she can't get in until she turns it on.
    const people = (await t.d.query('apps.publicOptions', { appId: 'vaultwarden' })).result!.data.people as Array<{
      displayName: string;
      totpEnabled: boolean;
    }>;
    expect(people.map((p) => [p.displayName, p.totpEnabled])).toEqual([
      ['Hari', true],
      ['Anu', false],
    ]);
    await t.setPublic();
    const res = await t.page('POST', '/.hlabs/sign-in', { form: { username: 'anu', password: PASSWORD } });
    expect(res.status).toBe(403);
    expect(pageData(await res.text())).toMatchObject({ kind: 'publicSignIn', step: 'no2fa' });
    expect(
      t.s.db
        .select()
        .from(sessions)
        .all()
        .filter((s) => s.publicHost),
    ).toEqual([]);
    expect(anu.userId).toBeTruthy();
  });

  it('turning two-factor off later shuts the public address to that person', async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    const { cookie } = await t.signIn();
    expect((await t.verify({ cookie: cookie! })).status).toBe(200);
    t.s.db.delete((await import('@hlabs/db')).userTotp).run();
    await new Promise((r) => setTimeout(r, 5));
    // A fresh check (the answer is cached for 10 s per cookie): a new forward-auth instance would see it at once.
    const { PublicAuth } = await import('../src/http/public');
    expect(new PublicAuth(t.s).verify(cookie!.split('=')[1]!, HOST)).toMatchObject({ status: 403 });
  });

  it('with nobody allowed in having two-factor, the hlabs login is refused, naming who to ask', async () => {
    const t = await publicFixture(closers, { totp: false });
    const { reply } = await t.setPublic();
    expect(reply.error?.data).toMatchObject({
      hlabsCode: 'TWO_FACTOR_REQUIRED_FOR_PUBLIC',
      detail: { users: ['Hari'] },
    });
  });

  it('a person the app is not shared with gets the "no access" page, with Sign out instead of Home', async () => {
    const t = await publicFixture(closers);
    const anu = await memberSession(t.d, { appIds: [] });
    const anuTotp = (
      (await anu.mutate('account.totp.begin', { password: PASSWORD })).result!.data as { secret: string }
    ).secret;
    await anu.mutate('account.totp.confirm', { code: generateSync({ secret: anuTotp }) });
    await t.setPublic();
    const res = await t.page('POST', '/.hlabs/sign-in', { form: { username: 'anu', password: PASSWORD } });
    expect(res.status).toBe(403);
    expect(pageData(await res.text())).toMatchObject({
      kind: 'noAccess',
      appName: 'Vaultwarden',
      adminName: 'Hari',
      username: 'anu',
      publicHost: HOST,
    });
    expect(
      t.s.db
        .select()
        .from(sessions)
        .all()
        .filter((s) => s.publicHost),
    ).toEqual([]);
  });

  it('signing out ends the session and clears the cookie (from the address itself only)', async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    const { cookie } = await t.signIn();
    expect((await t.page('POST', '/.hlabs/sign-out', { cookie: cookie!, origin: 'https://evil.example' })).status).toBe(
      403,
    );
    const out = await t.page('POST', '/.hlabs/sign-out', { cookie: cookie! });
    expect(out.status).toBe(303);
    expect(out.headers.get('location')).toBe('/.hlabs/sign-in');
    expect(out.headers.get('set-cookie')).toBe('__Host-hlabs_pub=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    expect((await t.verify({ cookie: cookie! })).status).toBe(302);
  });

  it('"next" only ever goes to a path on the same address', () => {
    expect(publicNext('/vault?x=1')).toBe('/vault?x=1');
    for (const bad of [
      '//evil.example',
      'https://evil.example',
      '/\\evil.example',
      '/.hlabs/sign-out',
      'vault',
      7,
      null,
      '/a\r\nSet-Cookie: x',
    ])
      expect(publicNext(bad), String(bad)).toBe('/');
  });

  it('changing who can get in is audited and told to the other admins; hlabs login keeps the home address behind it', async () => {
    const t = await publicFixture(closers, { extra: OWN_LOGIN_SAFE });
    const asha = await memberSession(t.d, { role: 'admin', username: 'asha' });
    await t.setPublic({ access: 'ownLogin', understood: true });
    await t.d.mutate('apps.setAuthMode', { appId: 'vaultwarden', mode: 'none' });
    expect(t.row().authMode).toBe('none');
    await t.setPublic({ access: 'hlabs' });
    expect(t.publicRow()!.access).toBe('hlabs');
    expect(t.audits('app.public.changed')).toEqual([
      expect.objectContaining({
        detailJson: {
          from: { address: `https://${HOST}`, access: 'ownLogin' },
          to: { address: `https://${HOST}`, access: 'hlabs' },
        },
      }),
    ]);
    expect(t.notes('app.public_changed')).toEqual([expect.objectContaining({ userId: asha.userId })]);
    // With hlabs's login on the public address, "Require hlabs login" is on and stays on.
    expect(t.row().authMode).toBe('hlabs');
    const refused = await t.d.mutate('apps.setAuthMode', { appId: 'vaultwarden', mode: 'none' });
    expect(refused.error?.data.hlabsCode).toBe('APP_IS_PUBLIC');
  });

  it('a new public name ends the sign-ins on the old one and deletes its record', async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    const { cookie } = await t.signIn();
    await t.setPublic({ hostname: 'vault' });
    expect(t.fake.hlabsRecords()).toEqual(['vault.example.com']);
    expect((await t.verify({ cookie: cookie!, host: 'vault.example.com' })).status).toBe(302);
    expect((await t.verify({ cookie: cookie! })).status).toBe(404);
  });

  it("the public listener's config: identity headers only from forward auth, hlabs's cookies out, HTTPS only", async () => {
    const t = await publicFixture(closers);
    await t.setPublic();
    const json = JSON.stringify(
      buildCaddyConfig((t.s.proxy as unknown as { last: ProxyState }).last, {
        storageDir: '/c',
        adminSocket: '/c/a.sock',
        logFile: '/c/log',
        webFallbackDir: '/f',
      }),
    );
    expect(json).toContain('"trusted_proxies":{"source":"static","ranges":["127.0.0.1/32","::1/128"]}');
    expect(json).toContain('"client_ip_headers":["Cf-Connecting-Ip"]');
    expect(json).toContain('"Referrer-Policy":["strict-origin-when-cross-origin"]');
    expect(json).toContain('"Strict-Transport-Security":["max-age=31536000"]');
    expect(json).toContain('"max_size":10485760');
    expect(json).toContain('"uri":"/auth/public-verify"');
    expect(json).toContain('"X-Forwarded-For":["{http.vars.client_ip}"]');
    // TLS from cloudflared with the one internal name's certificate from the local CA, never a public name's (D-181).
    expect(json).toContain('"tls_connection_policies":[{"default_sni":"public.hlabs.internal"}]');
    expect(json).toContain('"certificates":{"automate":["public.hlabs.internal"]}');
    expect(json).not.toMatch(/"subjects":\[[^\]]*example\.com/);
  });

  it("takes hlabs's cookies out of what the app gets, leaving the app's own (the same regexes Caddy runs)", () => {
    const [first, second] = stripHlabsCookies() as Array<{
      request: { replace: { Cookie: Array<{ search_regexp: string; replace: string }> } };
    }>;
    const strip = (cookie: string) =>
      [first!, second!].reduce((c, h) => {
        const r = h.request.replace.Cookie[0]!;
        return c.replace(new RegExp(r.search_regexp, 'g'), r.replace);
      }, cookie);
    expect(strip('a=1; __Host-hlabs_pub=xyz; b=2')).toBe('a=1; b=2');
    expect(strip('__Host-hlabs_pub=xyz; b=2')).toBe('b=2');
    expect(strip('a=1; hlabs_session=s')).toBe('a=1');
    expect(strip('__Host-hlabs_pub=xyz')).toBe('');
    expect(strip('my__Host-hlabs_pub=keep')).toBe('my__Host-hlabs_pub=keep');
  });
});

const CADDY = fileURLToPath(new URL('../../../.bin/caddy', import.meta.url));

describe.skipIf(!existsSync(CADDY))('US-APP-28 · the real Caddy on the public listener', () => {
  const servers: Server[] = [];
  let proxy: CaddyProxy;
  let publicPort: number;
  let logDir: string;
  const daemonSaw: Array<{ url: string; headers: IncomingMessage['headers'] }> = [];

  async function serve(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<[Server, number]> {
    const server = createServer(handler);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    servers.push(server);
    return [server, (server.address() as AddressInfo).port];
  }
  async function freePort() {
    const server = createServer();
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    await new Promise((r) => server.close(r));
    return port;
  }
  /** hlabs's local CA certificate, as cloudflared's caPool (D-181). */
  let ca = '';
  /** A request as cloudflared makes it, to the public listener: over TLS, asking for the internal name. */
  function send(
    host: string,
    path: string,
    headers: Record<string, string> = {},
    method = 'GET',
    body?: Buffer,
  ): Promise<{ status: number; headers: IncomingMessage['headers']; body: string }> {
    return new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port: publicPort,
          path,
          method,
          headers: { Host: host, ...headers },
          agent: false,
          servername: PUBLIC_ORIGIN_NAME,
          ca,
        },
        (res) => {
          answered = { status: res.statusCode!, headers: res.headers, body: '' };
          res.on('data', (c: Buffer) => (answered!.body += c.toString()));
          res.on('end', () => resolve(answered!));
        },
      );
      // Caddy may answer (a 413) and close while a large body is still being written: the answer stands.
      let answered: { status: number; headers: IncomingMessage['headers']; body: string } | null = null;
      req.on('error', (err) => (answered ? resolve(answered) : reject(err)));
      req.end(body);
    });
  }

  beforeAll(async () => {
    const dir = tempDir();
    const fallback = join(dir, 'fallback');
    mkdirSync(fallback);
    writeFileSync(join(fallback, 'index.html'), '<h1>fallback</h1>');
    logDir = join(dir, 'logs', 'public');
    const [, daemonPort] = await serve((req, res) => {
      daemonSaw.push({ url: req.url!, headers: req.headers });
      if (req.url!.startsWith('/auth/public-verify')) {
        if ((req.headers.cookie ?? '').includes('__Host-hlabs_pub=ok')) {
          res.setHeader('X-Hlabs-User', 'hari');
          res.setHeader('X-Hlabs-Role', 'admin');
          return res.end();
        }
        return res.writeHead(302, { Location: '/.hlabs/sign-in?next=%2F' }).end();
      }
      if (req.url!.startsWith('/auth/unavailable'))
        return res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' }).end('not running');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`hlabs page ${req.method} ${req.url}`);
    });
    const [, appPort] = await serve(async (req, res) => {
      // Reads what it's sent, as an upload would.
      let size = 0;
      try {
        for await (const chunk of req) size += (chunk as Buffer).length;
      } catch {
        return; // Caddy cut it off at the limit.
      }
      if (size > 0) return res.end(`got ${size}`);
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          url: req.url,
          user: req.headers['x-hlabs-user'] ?? null,
          cookie: req.headers.cookie ?? null,
          xff: req.headers['x-forwarded-for'] ?? null,
          proto: req.headers['x-forwarded-proto'] ?? null,
          publicHost: req.headers['x-hlabs-public-host'] ?? null,
        }),
      );
    });
    const [, ownPort] = await serve((req, res) => res.end(`own login app ${req.url}`));
    const downPort = await freePort();
    publicPort = await freePort();
    const state: ProxyState = {
      hostname: 'hlabs',
      ports: { https: await freePort(), http: await freePort() },
      onboardingComplete: true,
      dashboardUpstream: `127.0.0.1:${daemonPort}`,
      daemon: `127.0.0.1:${daemonPort}`,
      tailnetHost: null,
      lanAddresses: [],
      apps: [],
      public: {
        port: publicPort,
        logDir,
        apps: [
          {
            appId: 'vaultwarden',
            hostname: 'vault.example.com',
            port: appPort - LOOPBACK_OFFSET,
            access: 'hlabs',
            maxBodyMb: 1,
          },
          {
            appId: 'jellyfin',
            hostname: 'tv.example.com',
            port: ownPort - LOOPBACK_OFFSET,
            access: 'ownLogin',
            maxBodyMb: 10,
          },
          {
            appId: 'stopped',
            hostname: 'down.example.com',
            port: downPort - LOOPBACK_OFFSET,
            access: 'ownLogin',
            maxBodyMb: 10,
          },
        ],
      },
    };
    proxy = new CaddyProxy({
      binary: CADDY,
      dir: join(dir, 'caddy'),
      webFallbackDir: fallback,
      logger: silentLogger(),
    });
    await proxy.apply(state);
    // The local CA and the listener's certificate are made as Caddy starts.
    const root = join(caRootDir(proxy.paths.storageDir), 'root.crt');
    for (let i = 0; i < 100 && !existsSync(root); i++) await new Promise((r) => setTimeout(r, 100));
    ca = readFileSync(root, 'utf8');
    for (let i = 0; i < 50; i++) {
      const ok = await send('nope.example.com', '/').then(
        () => true,
        () => false,
      );
      if (ok) break;
      await new Promise((r) => setTimeout(r, 200));
    }
  }, 30_000);

  afterAll(async () => {
    await proxy?.stop();
    for (const s of servers) s.close();
  });

  it('answers 404 for a name that is not a public app: never the dashboard or the daemon', async () => {
    for (const host of ['hlabs.local', 'nope.example.com', '127.0.0.1']) {
      const res = await send(host, '/trpc/auth.me');
      expect(res.status, host).toBe(404);
      expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    }
    expect(daemonSaw.filter((r) => r.url.startsWith('/trpc'))).toEqual([]);
  });

  it('sends a page visited over plain HTTP to its https:// address, and refuses anything else (D-181)', async () => {
    const plain: Array<Record<string, string>> = [
      { 'X-Forwarded-Proto': 'http' },
      { 'Cf-Visitor': '{"scheme":"http"}' },
    ];
    for (const marked of plain) {
      const page = await send('vault.example.com', '/albums?x=1', marked);
      expect(page.status).toBe(308);
      expect(page.headers.location).toBe('https://vault.example.com/albums?x=1');
      expect(page.headers['strict-transport-security']).toBe('max-age=31536000');
      expect((await send('vault.example.com', '/', marked, 'HEAD')).status).toBe(308);
      // A form or a sign-in never goes on over plain HTTP, not even to the daemon's pages.
      const before = daemonSaw.length;
      expect((await send('vault.example.com', '/.hlabs/sign-in', marked, 'POST', Buffer.from('x'))).status).toBe(403);
      expect(daemonSaw.length).toBe(before);
    }
    expect(
      (await send('vault.example.com', '/', { 'X-Forwarded-Proto': 'https', 'Cf-Visitor': '{"scheme":"https"}' }))
        .status,
    ).toBe(302);
  });

  it('sends a visitor who is not signed in to sign in, with the headers on every answer', async () => {
    const res = await send('vault.example.com', '/', { Accept: 'text/html' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/.hlabs/sign-in?next=%2F');
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it("passes a signed-in visitor on with their address from CF-Connecting-IP, https, and without hlabs's cookies", async () => {
    const res = await send('vault.example.com', '/photos?x=1', {
      Cookie: 'theme=dark; __Host-hlabs_pub=ok; sid=app',
      'CF-Connecting-IP': '198.51.100.7',
      'X-Forwarded-For': '10.0.0.9',
      'X-Hlabs-User': 'evil',
      'X-Hlabs-Public-Host': 'evil.example.com',
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      url: '/photos?x=1',
      user: 'hari',
      cookie: 'theme=dark; sid=app',
      xff: '198.51.100.7',
      proto: 'https',
      publicHost: null,
    });
    // Only hlabs's cookie: no Cookie header at all.
    const only = JSON.parse((await send('vault.example.com', '/', { Cookie: '__Host-hlabs_pub=ok' })).body);
    expect(only.cookie).toBeNull();
    // Forward auth got the visitor and which public address it was, from Caddy, not the visitor.
    const verify = daemonSaw.filter((r) => r.url === '/auth/public-verify').at(-1)!;
    expect(verify.headers['x-hlabs-public-host']).toBe('vault.example.com');
  });

  it('sends exactly /.hlabs/sign-in and /.hlabs/sign-out to the daemon, and nothing else under /.hlabs', async () => {
    const res = await send('vault.example.com', '/.hlabs/sign-in?next=%2F', {
      'CF-Connecting-IP': '198.51.100.7',
      'X-Hlabs-Public-Host': 'evil.example.com',
    });
    expect(res.body).toBe('hlabs page GET /.hlabs/sign-in?next=%2F');
    const seen = daemonSaw.at(-1)!;
    expect(seen.headers['x-hlabs-public-host']).toBe('vault.example.com');
    expect(seen.headers['x-forwarded-for']).toBe('198.51.100.7');
    expect((await send('vault.example.com', '/.hlabs/sign-out', {}, 'POST')).body).toBe(
      'hlabs page POST /.hlabs/sign-out',
    );
    expect((await send('vault.example.com', '/.hlabs/../trpc/auth.me')).status).not.toBe(200);
    expect((await send('vault.example.com', '/.hlabs/anything')).status).toBe(404);
  });

  it('keeps the request size limit', async () => {
    // Caddy answers 413 and closes; if it closes while the body is still being written, the client sees the connection
    // dropped instead. Either way the upload never reaches the app.
    const res = await send(
      'vault.example.com',
      '/upload',
      { Cookie: '__Host-hlabs_pub=ok', 'Content-Type': 'application/octet-stream' },
      'POST',
      Buffer.alloc(2 * 1024 * 1024),
    ).catch((err: NodeJS.ErrnoException) => ({ status: err.code ?? 'error', body: '' }));
    expect([413, 'EPIPE', 'ECONNRESET']).toContain(res.status);
    expect(res.body).not.toMatch(/^got /);
  });

  it("an app with its own login only is reached without hlabs's login; a stopped one gets the daemon's page", async () => {
    expect((await send('tv.example.com', '/', {})).body).toBe('own login app /');
    expect((await send('tv.example.com', '/.hlabs/sign-in', {})).body).toBe('own login app /.hlabs/sign-in');
    const down = await send('down.example.com', '/', { Accept: 'text/html' });
    expect(down.status).toBe(503);
    expect(down.body).toBe('not running');
    expect(daemonSaw.at(-1)!.headers['x-hlabs-public-host']).toBe('down.example.com');
  });

  it('logs each request for Visits, with the visitor and country from Cloudflare and no cookies', async () => {
    await send('vault.example.com', '/visit-me', {
      'CF-Connecting-IP': '192.0.2.44',
      'CF-IPCountry': 'nl',
      Cookie: '__Host-hlabs_pub=secret-value',
    });
    let visits: ReturnType<typeof readVisits>['items'] = [];
    for (let i = 0; i < 50 && !visits.some((v) => v.path === '/visit-me'); i++) {
      await new Promise((r) => setTimeout(r, 100));
      visits = readVisits(logDir, 'vault.example.com', { now: Date.now(), limit: 200 }).items;
    }
    expect(visits.find((v) => v.path === '/visit-me')).toMatchObject({
      ip: '192.0.2.44',
      country: 'NL',
      result: 'askedToSignIn',
      status: 302,
    });
    const { readdirSync, readFileSync } = await import('node:fs');
    const text = readdirSync(logDir)
      .map((f) => readFileSync(join(logDir, f), 'utf8'))
      .join('');
    expect(text).not.toContain('secret-value');
  });
});
