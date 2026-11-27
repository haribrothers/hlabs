// US-HOME-20 (server side, D-157): app widgets read from the app's web service with the admin's key, filled from the
// manifest's fields, text only and short; "isn't running", "needs a key", a failure keeping the last good value; the key
// in the keychain (never SQLite), audited; members never get a widget read with an admin's key.
import { auditLog } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { AppWidgets, fillTemplate, pick } from '../src/home/app-widgets';
import { daemonWithAdmin } from './admin-session';
import { appServer, installApp, type WidgetDecl } from './home-fixture';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const library: WidgetDecl = {
  id: 'library',
  name: 'Photo library',
  template: 'twoStat',
  path: '/api/server/statistics',
  fields: { first: { value: 'photos', label: 'photos' }, second: { value: 'videos', label: 'videos' } },
  auth: { header: 'Authorization', prefix: 'Token ', help: 'Make a key in Immich.' },
};
type Data = Record<string, { status: string; data?: unknown }>;

describe('US-HOME-20', () => {
  it('reads the app with the admin’s key and fills the widget; asks for the key first', async () => {
    const d = await daemonWithAdmin(closers);
    const server = await appServer(() => ({ body: { photos: 1204, videos: 87, usage: 9 } }), closers);
    installApp(d.services!.db, 'immich', 'Immich', { widgets: [library], port: server.port });
    const get = async () =>
      ((await d.query('home.getWidgetData', { widgetIds: ['app:immich:library'] })).result!.data as Data)[
        'app:immich:library'
      ];

    expect((await get())!.status).toBe('needs_key');
    expect((await d.query('apps.widgetKey', { appId: 'immich' })).result!.data).toEqual({
      needed: true,
      set: false,
      help: 'Make a key in Immich.',
    });

    expect((await d.mutate('apps.setWidgetKey', { appId: 'immich', key: 'sekrit-key-123' })).result!.data).toEqual({
      ok: true,
    });
    expect(await get()).toMatchObject({
      status: 'ok',
      data: { template: 'twoStat', first: { value: 1204, label: 'photos' }, second: { value: 87, label: 'videos' } },
    });
    expect(server.requests.at(-1)!.headers.authorization).toBe('Token sekrit-key-123');
    expect(server.requests.at(-1)!.url).toBe('/api/server/statistics');

    // Within its refresh time the app isn't asked again.
    const asked = server.requests.length;
    await get();
    expect(server.requests.length).toBe(asked);

    // The key is in the keychain, not the database; the change is audited without it.
    expect(await d.services!.secrets.get('widget-key:immich')).toBe('sekrit-key-123');
    const dump = JSON.stringify(d.services!.db.$client.prepare('SELECT * FROM settings').all());
    expect(dump).not.toContain('sekrit-key-123');
    const audit = d
      .services!.db.select()
      .from(auditLog)
      .all()
      .filter((a) => a.target === 'immich');
    expect(audit.map((a) => a.action)).toEqual(['app.widget_key.set']);
    expect(JSON.stringify(audit)).not.toContain('sekrit-key-123');
  });

  it('a stopped app’s widget says it isn’t running; members never get a widget read with an admin’s key', async () => {
    const d = await daemonWithAdmin(closers);
    installApp(d.services!.db, 'immich', 'Immich', { widgets: [library], state: 'stopped' });
    const data = (await d.query('home.getWidgetData', { widgetIds: ['app:immich:library'] })).result!.data as Data;
    expect(data['app:immich:library']!.status).toBe('app_not_running');
    const anu = await memberSession(d, { appIds: ['immich'] });
    expect((await anu.query('home.getWidgetData', { widgetIds: ['app:immich:library'] })).result!.data).toEqual({});
  });

  it('a timeout or a failure shows "Couldn’t load", keeping the last good value', async () => {
    const d = await daemonWithAdmin(closers);
    let mode: 'ok' | 'slow' | 'fail' = 'ok';
    const server = await appServer(
      () => (mode === 'ok' ? { body: { up: 4, down: 1 } } : mode === 'slow' ? { delayMs: 400 } : { status: 500 }),
      closers,
    );
    installApp(d.services!.db, 'kuma', 'Uptime Kuma', {
      port: server.port,
      widgets: [
        {
          id: 'monitors',
          name: 'Monitors',
          template: 'twoStat',
          path: '/s',
          refresh: 10,
          fields: { first: { value: 'up', label: 'up' }, second: { value: 'down', label: 'down' } },
        },
      ],
    });
    let now = 1_000_000;
    const w = new AppWidgets({ db: d.services!.db, secrets: d.services!.secrets, now: () => now, timeoutMs: 100 });
    expect((await w.data('app:kuma:monitors'))!.status).toBe('ok');
    mode = 'slow';
    now += 11_000;
    expect(await w.data('app:kuma:monitors')).toEqual({
      status: 'error',
      data: { template: 'twoStat', first: { value: 4, label: 'up' }, second: { value: 1, label: 'down' } },
      updatedAt: 1_000_000,
    });
    mode = 'fail';
    now += 11_000;
    expect((await w.data('app:kuma:monitors'))!.status).toBe('error');
  });

  it('values are text or numbers, cut at 60 characters; a list shows at most three rows', () => {
    expect(pick({ a: { b: [{ c: 7 }] } }, 'a.b[0].c')).toBe(7);
    const long = 'x'.repeat(80);
    const stat = fillTemplate(
      {
        id: 'w',
        name: 'W',
        template: 'stat',
        endpoint: { service: 'web', path: '/' },
        refresh: 60,
        fields: { value: { value: 'title', label: 'now' } },
      },
      { title: `<img src=x onerror=alert(1)>${long}` },
    );
    expect(stat).toEqual({
      template: 'stat',
      value: { value: `<img src=x onerror=alert(1)>${'x'.repeat(31)}…`, label: 'now' },
    });
    const list = fillTemplate(
      {
        id: 'w',
        name: 'W',
        template: 'list',
        endpoint: { service: 'web', path: '/' },
        refresh: 60,
        fields: { items: 'sessions', title: 'user', detail: 'item.name' },
      },
      { sessions: [1, 2, 3, 4].map((n) => ({ user: `u${n}`, item: { name: `film ${n}` } })) },
    );
    expect(list).toEqual({
      template: 'list',
      rows: [
        { title: 'u1', detail: 'film 1' },
        { title: 'u2', detail: 'film 2' },
        { title: 'u3', detail: 'film 3' },
      ],
    });
  });
});
