// US-AUTH-17 · Protect every app with forward auth: GET /auth/verify as Caddy calls it.
import { appAccess, apps, setSetting, users, type AppState } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { buildCaddyConfig } from '../src/caddy/config';
import { ForwardAuth, VERIFY_CACHE_MS } from '../src/http/verify';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const HTML = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

async function setup() {
  const d = await daemonWithAdmin(closers);
  const s = d.services!;
  const addApp = (id: string, state: AppState = 'running', authMode: 'hlabs' | 'none' = 'hlabs') =>
    s.db
      .insert(apps)
      .values({
        id,
        version: '1',
        state,
        hostname: id,
        portFallback: 12000 + id.length,
        authMode,
        installedAt: 1,
        updatedAt: 1,
      })
      .run();
  const addMember = (username = 'anu') => {
    const id = ulid();
    s.db
      .insert(users)
      .values({ id, username, displayName: 'Anu', role: 'member', passwordHash: 'x', createdAt: 1 })
      .run();
    const { raw } = s.sessions.create({ userId: id });
    return { id, cookie: `hlabs_session=${raw}` };
  };
  const verify = (host: string, opts: { cookie?: string; method?: string; accept?: string; uri?: string } = {}) =>
    fetch(`${d.url}/auth/verify`, {
      redirect: 'manual',
      headers: {
        'x-forwarded-host': host,
        'x-forwarded-method': opts.method ?? 'GET',
        'x-forwarded-uri': opts.uri ?? '/photos?x=1',
        accept: opts.accept ?? HTML,
        ...(opts.cookie ? { cookie: opts.cookie } : {}),
      },
    });
  return { d, s, addApp, addMember, verify };
}

describe('US-AUTH-17', () => {
  it('a valid session with access gets 200 with X-Hlabs-User and X-Hlabs-Role', async () => {
    const t = await setup();
    t.addApp('immich');
    const res = await t.verify('immich.hlabs.local', { cookie: t.d.cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-hlabs-user')).toBe('hari');
    expect(res.headers.get('x-hlabs-role')).toBe('admin');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('a signed-out browser navigation gets 302 to the dashboard log in with the original URL as next', async () => {
    const t = await setup();
    t.addApp('immich');
    const res = await t.verify('immich.hlabs.local');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      `https://hlabs.local/login?next=${encodeURIComponent('https://immich.hlabs.local/photos?x=1')}`,
    );
    // On the fallback port (D-016) the dashboard is on that port too.
    const other = await t.verify('immich.hlabs.local:8443', { cookie: 'hlabs_session=nonsense' });
    expect(other.headers.get('location')).toBe(
      `https://hlabs.local:8443/login?next=${encodeURIComponent('https://immich.hlabs.local:8443/photos?x=1')}`,
    );
  });

  it('a signed-out XHR, API or non-GET request gets 401 with no body', async () => {
    const t = await setup();
    t.addApp('immich');
    for (const opts of [{ accept: 'application/json' }, { method: 'POST' }, { accept: '*/*' }]) {
      const res = await t.verify('immich.hlabs.local', opts);
      expect(res.status).toBe(401);
      expect(await res.text()).toBe('');
    }
  });

  it('a revoked session is sent to log in straight away', async () => {
    const t = await setup();
    t.addApp('immich');
    expect((await t.verify('immich.hlabs.local', { cookie: t.d.cookie })).status).toBe(200);
    t.s.sessions.revoke({ userId: t.d.userId });
    expect((await t.verify('immich.hlabs.local', { cookie: t.d.cookie })).status).toBe(302);
  });

  it('while two-factor must be set up, sends the browser to the setup flow', async () => {
    const t = await setup();
    t.addApp('immich');
    setSetting(t.s.db, 'people', {
      showUserList: true,
      requireTotp: true,
      membersCanInstall: false,
      membersCanSeeUsage: false,
    });
    const res = await t.verify('immich.hlabs.local', { cookie: t.d.cookie });
    expect(res.headers.get('location')).toMatch(/^https:\/\/hlabs\.local\/settings\/account\/two-factor\?next=/);
  });

  it('Caddy skips /auth/verify for an app with auth_mode none', () => {
    const config = buildCaddyConfig(
      {
        hostname: 'hlabs',
        ports: { https: 443, http: 80 },
        onboardingComplete: true,
        dashboardUpstream: '127.0.0.1:7474',
        daemon: '127.0.0.1:7474',
        tailnetHost: null,
        apps: [{ appId: 'vaultwarden', hostname: 'vaultwarden', port: 12001, auth: 'none', embed: false }],
      },
      { storageDir: '/d', adminSocket: '/d/a.sock', logFile: '/d/l', webFallbackDir: '/f' },
    );
    expect(JSON.stringify(config.apps.http.servers.https.routes)).not.toContain('/auth/verify');
  });

  it('a host that is no installed app gets 404 with the 404 page (not an access denial)', async () => {
    const t = await setup();
    t.addApp('gitea', 'installing');
    for (const host of ['nextcloud.hlabs.local', 'gitea.hlabs.local', 'immich.example.com']) {
      const res = await t.verify(host, { cookie: t.d.cookie });
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toMatch(/^text\/html/);
      const html = await res.text();
      expect(html).toContain('"kind":"notFound"');
      expect(html).toContain('"homeUrl":"https://hlabs.local/"');
    }
    const api = await t.verify('nextcloud.hlabs.local', { accept: 'application/json' });
    expect(api.status).toBe(404);
    expect(await api.text()).toBe('');
  });

  it('a member gets their shared apps and 403 for the rest', async () => {
    const t = await setup();
    t.addApp('immich');
    t.addApp('gitea');
    const member = t.addMember();
    t.s.db.insert(appAccess).values({ appId: 'immich', userId: member.id }).run();
    const shared = await t.verify('immich.hlabs.local', { cookie: member.cookie });
    expect([shared.status, shared.headers.get('x-hlabs-user'), shared.headers.get('x-hlabs-role')]).toEqual([
      200,
      'anu',
      'member',
    ]);
    expect((await t.verify('gitea.hlabs.local', { cookie: member.cookie, accept: 'application/json' })).status).toBe(
      403,
    );
  });

  it('answers in under 5 ms p95 at 100 requests a second from one browser', async () => {
    const t = await setup();
    t.addApp('immich');
    // The daemon's own time for each answer (Server-Timing), so a busy test machine's network stack doesn't decide it.
    const times: number[] = [];
    for (let i = 0; i < 120; i++) {
      const res = await t.verify('immich.hlabs.local', { cookie: t.d.cookie, uri: `/asset/${i}` });
      await res.arrayBuffer();
      if (i >= 20) times.push(Number(/dur=([\d.]+)/.exec(res.headers.get('server-timing') ?? '')![1]));
    }
    times.sort((a, b) => a - b);
    expect(times[94]).toBeLessThan(5);
  });
});

describe('US-AUTH-17 · verify cache', () => {
  it('keeps an answer for 10 s, and drops it at once on revoke, access change or app change', async () => {
    const t = await setup();
    t.addApp('immich');
    const member = t.addMember();
    let now = Date.now();
    const auth = new ForwardAuth(t.s, () => now);
    const req = {
      cookie: member.cookie.split('=')[1]!,
      host: 'immich.hlabs.local',
      method: 'GET',
      uri: '/',
      accept: '',
    };
    expect(auth.verify(req).status).toBe(403);
    // Shared without an event: the cached answer stands until 10 s have passed.
    t.s.db.insert(appAccess).values({ appId: 'immich', userId: member.id }).run();
    expect(auth.verify(req).status).toBe(403);
    now += VERIFY_CACHE_MS;
    expect(auth.verify(req).status).toBe(200);
    // Unshared with the event: straight away.
    t.s.db.delete(appAccess).run();
    t.s.bus.emit('access.changed', { userId: member.id }, { kind: 'all' });
    expect(auth.verify(req).status).toBe(403);
  });
});
