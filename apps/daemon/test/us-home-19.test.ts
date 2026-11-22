// US-HOME-19 (server side): the widget picker's catalog for admins and members, apps' widgets, and the four-widget limit.
import { users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { setSetting, getSetting } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';
import { installApp, type WidgetDecl } from './home-fixture';
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
  auth: { header: 'x-api-key', help: 'Make a key in Immich under Account settings › API keys.' },
};
const monitors: WidgetDecl = {
  id: 'monitors',
  name: 'Monitors',
  template: 'twoStat',
  path: '/status.json',
  fields: { first: { value: 'up', label: 'up' }, second: { value: 'down', label: 'down' } },
};

type Catalog = {
  system: Array<{ id: string; name: string }>;
  apps: Array<{ id: string; appName: string; name: string; needsKey: boolean; hasKey: boolean }>;
};

async function setup() {
  const d = await daemonWithAdmin(closers);
  installApp(d.services!.db, 'immich', 'Immich', { widgets: [library] });
  installApp(d.services!.db, 'kuma', 'Uptime Kuma', { widgets: [monitors] });
  installApp(d.services!.db, 'vault', 'Vaultwarden');
  return d;
}

describe('US-HOME-19', () => {
  it('an admin gets hlabs’s six widgets and every app’s widgets', async () => {
    const d = await setup();
    const c = (await d.query('home.listWidgets')).result!.data as unknown as Catalog;
    expect(c.system.map((w) => w.name)).toEqual([
      'Live usage',
      'Storage',
      'Remote access',
      'Backups',
      'App status',
      'Updates',
    ]);
    expect(c.apps).toEqual([
      expect.objectContaining({
        id: 'app:immich:library',
        appName: 'Immich',
        name: 'Photo library',
        needsKey: true,
        hasKey: false,
      }),
      expect.objectContaining({ id: 'app:kuma:monitors', appName: 'Uptime Kuma', needsKey: false }),
    ]);
  });

  it('a member gets My files and Shared apps (Live usage only when allowed), and shared apps’ widgets without keys', async () => {
    const d = await setup();
    const anu = await memberSession(d, { appIds: ['immich', 'kuma'] });
    let c = (await anu.query('home.listWidgets')).result!.data as unknown as Catalog;
    expect(c.system.map((w) => w.id)).toEqual(['my-files', 'shared-apps']);
    // Immich's widget would show everyone's photos with an admin's key: not offered (D-157).
    expect(c.apps.map((w) => w.id)).toEqual(['app:kuma:monitors']);

    const db = d.services!.db;
    setSetting(db, 'people', { ...getSetting(db, 'people'), membersCanSeeUsage: true });
    db.update(users).set({ canSeeUsage: true }).where(eq(users.id, anu.userId)).run();
    c = (await anu.query('home.listWidgets')).result!.data as unknown as Catalog;
    expect(c.system.map((w) => w.id)).toEqual(['my-files', 'shared-apps', 'live-usage']);
  });

  it('up to four widgets fit on Home: a fifth isn’t saved', async () => {
    const d = await setup();
    const ids = ['live-usage', 'storage', 'remote-access', 'backups', 'app-status'];
    const saved = (await d.mutate('home.saveLayout', { items: ids.map((id) => ({ kind: 'widget', id })) })).result!
      .data as { items: Array<{ kind: string; id: string }> };
    expect(saved.items.filter((i) => i.kind === 'widget').map((i) => i.id)).toEqual(ids.slice(0, 4));
  });

  it('App status counts running, stopped and broken apps; Updates counts pending updates', async () => {
    const d = await setup();
    installApp(d.services!.db, 'gitea', 'Gitea', { state: 'stopped' });
    installApp(d.services!.db, 'n8n', 'n8n', { state: 'error' });
    const data = (await d.query('home.getWidgetData', { widgetIds: ['app-status', 'updates'] })).result!.data as Record<
      string,
      { status: string; data: unknown }
    >;
    expect(data['app-status']).toMatchObject({ status: 'ok', data: { running: 3, stopped: 1, attention: 1 } });
    expect(data.updates).toMatchObject({ status: 'ok', data: { count: expect.any(Number) } });
  });

  it('an uninstalled app’s widget leaves the layout on the next read', async () => {
    const d = await setup();
    await d.mutate('home.saveLayout', { items: [{ kind: 'widget', id: 'app:kuma:monitors' }] });
    const { apps } = await import('@hlabs/db');
    d.services!.db.delete(apps).where(eq(apps.id, 'kuma')).run();
    const l = (await d.query('home.getLayout')).result!.data as { items: Array<{ kind: string; id: string }> };
    expect(l.items.filter((i) => i.kind === 'widget')).toEqual([]);
  });
});
