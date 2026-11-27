// US-HOME-22 (server side): pinned Dock apps, per person, at most eight, only apps they can open, gone when uninstalled.
import { apps } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';
import { installApp } from './home-fixture';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-HOME-22', () => {
  it('a new account has no pinned apps', async () => {
    const d = await daemonWithAdmin(closers);
    expect(((await d.query('home.getLayout')).result!.data as { dock: string[] }).dock).toEqual([]);
  });

  it('pins in order, at most eight, only installed apps, no repeats', async () => {
    const d = await daemonWithAdmin(closers);
    const ids = Array.from({ length: 10 }, (_, i) => `app-${i}`);
    for (const id of ids) installApp(d.services!.db, id, id);
    const saved = (await d.mutate('home.saveDock', { appIds: ['app-3', 'app-3', 'nope', ...ids.slice(0, 5)] })).result!
      .data as { dock: string[] };
    expect(saved.dock).toEqual(['app-3', 'app-0', 'app-1', 'app-2', 'app-4']);
    const tooMany = await d.mutate('home.saveDock', { appIds: ids.slice(0, 9) });
    expect(tooMany.error?.data.hlabsCode).toBe('VALIDATION_FAILED');
  });

  it('each person has their own; a member only pins apps shared with them; an uninstalled app is unpinned', async () => {
    const d = await daemonWithAdmin(closers);
    installApp(d.services!.db, 'immich', 'Immich');
    installApp(d.services!.db, 'vault', 'Vaultwarden');
    await d.mutate('home.saveDock', { appIds: ['vault', 'immich'] });
    const anu = await memberSession(d, { appIds: ['immich'] });
    await anu.mutate('home.saveDock', { appIds: ['vault', 'immich'] });
    const dockOf = async (q: typeof d.query) => ((await q('home.getLayout')).result!.data as { dock: string[] }).dock;
    expect(await dockOf(d.query)).toEqual(['vault', 'immich']);
    expect(await dockOf(anu.query)).toEqual(['immich']);
    d.services!.db.delete(apps).where(eq(apps.id, 'vault')).run();
    expect(await dockOf(d.query)).toEqual(['immich']);
  });
});
