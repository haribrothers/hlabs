// US-HOME-16, 17, 18 (server side): edit mode's "Done" saves the order, which every device then gets; apps installed
// meanwhile are appended; what a person can't have is dropped; apps taken off Home stay off but stay installed, and
// search offers them back.
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';
import { installApp } from './home-fixture';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Item = { kind: 'app' | 'widget'; id: string };
type Layout = { items: Item[]; dock: string[]; hidden: string[] };

async function setup() {
  const d = await daemonWithAdmin(closers);
  const db = d.services!.db;
  for (const [id, name] of [
    ['jellyfin', 'Jellyfin'],
    ['immich', 'Immich'],
    ['vault', 'Vaultwarden'],
  ] as const)
    installApp(db, id, name);
  const layout = async (q = d.query) => (await q('home.getLayout')).result!.data as unknown as Layout;
  return { d, db, layout };
}

const apps = (l: { items: Item[] }) => l.items.filter((i) => i.kind === 'app').map((i) => i.id);
const widgets = (l: { items: Item[] }) => l.items.filter((i) => i.kind === 'widget').map((i) => i.id);

describe('US-HOME-16 · Done saves Home', () => {
  it('the saved order is what every device gets afterwards', async () => {
    const { d, layout } = await setup();
    const items: Item[] = [
      { kind: 'widget', id: 'storage' },
      { kind: 'widget', id: 'live-usage' },
      { kind: 'app', id: 'vault' },
      { kind: 'app', id: 'jellyfin' },
      { kind: 'app', id: 'immich' },
    ];
    const saved = (await d.mutate('home.saveLayout', { items })).result!.data;
    expect(saved).toEqual({ items, hidden: [] });
    expect((await layout()).items).toEqual(items);
  });

  it('apps installed meanwhile are appended; ids that are gone or not allowed are dropped', async () => {
    const { d, db, layout } = await setup();
    installApp(db, 'gitea', 'Gitea');
    await d.mutate('home.saveLayout', {
      items: [
        { kind: 'app', id: 'immich' },
        { kind: 'app', id: 'uninstalled-meanwhile' },
        { kind: 'widget', id: 'no-such-widget' },
        { kind: 'widget', id: 'storage' },
        { kind: 'app', id: 'immich' },
      ],
    });
    const l = await layout();
    expect(apps(l)).toEqual(['immich', 'jellyfin', 'vault', 'gitea']);
    expect(widgets(l)).toEqual(['storage']);
  });

  it("a member can't save admin widgets or apps not shared with them", async () => {
    const { d } = await setup();
    const anu = await memberSession(d, { appIds: ['immich'] });
    const saved = (
      await anu.mutate('home.saveLayout', {
        items: [
          { kind: 'widget', id: 'storage' },
          { kind: 'widget', id: 'my-files' },
          { kind: 'app', id: 'vault' },
          { kind: 'app', id: 'immich' },
        ],
      })
    ).result!.data as { items: Item[] };
    expect(saved.items).toEqual([
      { kind: 'widget', id: 'my-files' },
      { kind: 'app', id: 'immich' },
    ]);
  });
});

describe('US-HOME-18 · taken off Home, still installed', () => {
  it('stays off Home (not appended as new), and comes back when added', async () => {
    const { d, layout } = await setup();
    await d.mutate('home.saveLayout', {
      items: [
        { kind: 'app', id: 'jellyfin' },
        { kind: 'app', id: 'immich' },
      ],
      hidden: ['vault'],
    });
    let l = await layout();
    expect(apps(l)).toEqual(['jellyfin', 'immich']);
    expect(l.hidden).toEqual(['vault']);
    // Still installed and running: nothing was uninstalled or stopped.
    const listed = (await d.query('apps.list')).result!.data.apps as Array<{ id: string; state: string }>;
    expect(listed.find((a) => a.id === 'vault')?.state).toBe('running');

    // Search finds it under Installed, with "Add Vaultwarden to Home".
    const found = (await d.query('home.searchEverything', { query: 'vault' })).result!.data as {
      installed: Array<{ id: string }>;
      actions: Array<{ kind: string; appId: string }>;
    };
    expect(found.installed.map((a) => a.id)).toContain('vault');
    expect(found.actions[0]).toMatchObject({ kind: 'addToHome', appId: 'vault' });
    const jelly = (await d.query('home.searchEverything', { query: 'jelly' })).result!.data as {
      actions: Array<{ kind: string }>;
    };
    expect(jelly.actions.map((a) => a.kind)).not.toContain('addToHome');

    // Added back: appended at the end.
    await d.mutate('home.saveLayout', { items: [...l.items, { kind: 'app', id: 'vault' }], hidden: [] });
    l = await layout();
    expect(apps(l)).toEqual(['jellyfin', 'immich', 'vault']);
    expect(l.hidden).toEqual([]);
  });

  it('removing every widget leaves none (no widgets row)', async () => {
    const { d, layout } = await setup();
    await d.mutate('home.saveLayout', { items: [{ kind: 'app', id: 'jellyfin' }] });
    expect(widgets(await layout())).toEqual([]);
  });
});
