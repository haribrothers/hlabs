// US-AUTH-19 · See a "no access" page for apps not shared with me: /auth/verify's 403 for members.
import { appAccess, apps, appSources, catalogApps, users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { ForwardAuth, VERIFY_CACHE_MS } from '../src/http/verify';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const HTML = 'text/html,application/xhtml+xml,*/*;q=0.8';

async function setup(appName = 'Immich') {
  const d = await daemonWithAdmin(closers);
  const s = d.services!;
  s.db
    .insert(appSources)
    .values({ id: 'builtin', kind: 'builtin', name: 'hlabs', url: 'builtin:' })
    .onConflictDoNothing()
    .run();
  s.db
    .insert(catalogApps)
    .values({
      sourceId: 'builtin',
      appId: 'immich',
      version: '1',
      manifestJson: { name: appName },
      updatedAt: 1,
      firstSeenAt: 1,
    })
    .onConflictDoUpdate({ target: [catalogApps.sourceId, catalogApps.appId], set: { manifestJson: { name: appName } } })
    .run();
  s.db
    .insert(apps)
    .values({
      id: 'immich',
      sourceId: 'builtin',
      version: '1',
      state: 'running',
      hostname: 'immich',
      portFallback: 12000,
      installedAt: 1,
      updatedAt: 1,
    })
    .run();
  const memberId = ulid();
  s.db
    .insert(users)
    .values({
      id: memberId,
      username: 'anu',
      displayName: 'Anu',
      role: 'member',
      avatarColor: 'mint',
      passwordHash: 'x',
      createdAt: 5,
    })
    .run();
  const { raw } = s.sessions.create({ userId: memberId });
  const verify = (cookie: string, accept = HTML) =>
    fetch(`${d.url}/auth/verify`, {
      redirect: 'manual',
      headers: { 'x-forwarded-host': 'immich.hlabs.local', 'x-forwarded-uri': '/', accept, cookie },
    });
  return { d, s, memberId, raw, member: `hlabs_session=${raw}`, verify };
}

const pageData = (html: string) =>
  JSON.parse(/<script id="hlabs-page" type="application\/json">(.*?)<\/script>/.exec(html)![1]!) as Record<
    string,
    unknown
  >;

describe('US-AUTH-19', () => {
  it('a member opening an app not shared with them gets 403 with the "no access" page, not a redirect or 404', async () => {
    const t = await setup();
    const res = await t.verify(t.member);
    expect(res.status).toBe(403);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
    expect(pageData(await res.text())).toEqual({
      kind: 'noAccess',
      homeUrl: 'https://hlabs.local/',
      appName: 'Immich',
      adminName: 'Hari',
      username: 'anu',
      displayName: 'Anu',
      avatarColor: 'mint',
      accent: 'violet',
    });
  });

  it('asks the oldest enabled admin', async () => {
    const t = await setup();
    // An older admin who is disabled is skipped; the first admin (created at setup) is still the oldest enabled one.
    t.s.db
      .insert(users)
      .values({
        id: ulid(),
        username: 'old',
        displayName: 'Old Admin',
        role: 'admin',
        passwordHash: 'x',
        createdAt: 0,
        disabledAt: 1,
      })
      .run();
    t.s.db
      .insert(users)
      .values({
        id: ulid(),
        username: 'new',
        displayName: 'New Admin',
        role: 'admin',
        passwordHash: 'x',
        createdAt: Date.now() + 1,
      })
      .run();
    expect(pageData(await (await t.verify(t.member)).text()).adminName).toBe('Hari');
  });

  it('admins never get it: they can open every app', async () => {
    const t = await setup();
    expect((await t.verify(t.d.cookie)).status).toBe(200);
  });

  it('a request that is not a browser navigation gets 403 with no body', async () => {
    const t = await setup();
    const res = await t.verify(t.member, 'application/json');
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('works within 10 seconds of the admin sharing the app', async () => {
    const t = await setup();
    let now = Date.now();
    const auth = new ForwardAuth(t.s, () => now);
    const req = { cookie: t.raw, host: 'immich.hlabs.local', method: 'GET', uri: '/', accept: HTML };
    expect(auth.verify(req).status).toBe(403);
    t.s.db.insert(appAccess).values({ appId: 'immich', userId: t.memberId }).run();
    now += VERIFY_CACHE_MS;
    expect(auth.verify(req).status).toBe(200);
    // Through the daemon, the access.changed event makes it immediate.
    t.s.bus.emit('access.changed', { userId: t.memberId }, { kind: 'all' });
    expect((await t.verify(t.member)).status).toBe(200);
  });

  it('keeps names as data: nothing in them can close the script or add markup', async () => {
    const t = await setup('</script><img src=x onerror=alert(1)>');
    const html = await (await t.verify(t.member)).text();
    expect(html).not.toContain('<img src=x');
    expect(pageData(html).appName).toBe('</script><img src=x onerror=alert(1)>');
  });
});
