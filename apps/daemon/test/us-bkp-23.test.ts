// US-BKP-23 · Choose what's included in backups (server side): everything and new apps by default; the saved list
// is what runs copy; new apps ticked while "Include new apps automatically" is on, else counted as not backed up; the
// estimate of a full copy.
import { auditLog } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { includeNew } from '../src/backups/plan';
import { backupsDaemon } from './backups-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Plan = {
  include: { apps: string[]; folders: string[]; includeNewApps: boolean };
  apps: Array<{ id: string; sizeBytes: number; excluded: string | null }>;
  folders: Array<{ id: string; label: string }>;
};

describe('US-BKP-23', () => {
  it('a new installation includes every app and Home folder, and new apps', async () => {
    const t = await backupsDaemon(closers);
    t.app('immich', { backup: { exclude: ['thumbs/', 'encoded-video/'] } });
    t.app('vaultwarden');
    const plan = t.data<Plan>(await t.d.query('backups.plan.get'));
    expect(plan.include).toEqual({
      apps: ['immich', 'vaultwarden'],
      folders: ['users/anu', 'users/hari', 'shared'],
      includeNewApps: true,
    });
    expect(plan.folders.map((f) => f.label)).toEqual(['Home › Anu', 'Home › Hari', 'Shared']);
    expect(plan.apps.find((a) => a.id === 'immich')).toMatchObject({ excluded: 'thumbs, encoded-video excluded' });
    expect(plan.apps.find((a) => a.id === 'vaultwarden')!.sizeBytes).toBeGreaterThan(0);
  });

  it('what’s saved is what runs copy; unticking everything still copies the system part', async () => {
    const t = await backupsDaemon(closers);
    t.app('immich');
    t.app('vaultwarden');
    t.put('users/hari/notes.txt');
    await t.nasDestination();
    t.data(
      await t.d.mutate('backups.plan.update', {
        include: { apps: ['vaultwarden'], folders: ['users/hari'], includeNewApps: true },
      }),
    );
    expect(t.db.select().from(auditLog).where(eq(auditLog.action, 'backup.plan.update')).all()).toHaveLength(1);
    const run = async () => t.s.jobs.settled(t.data<{ jobId: string }>(await t.d.mutate('backups.runNow')).jobId);
    await run();
    const tags = () =>
      t.restic.calls.filter((c) => c.op === 'backup').map((c) => (c.detail as { tags: string[] }).tags[0]);
    expect(tags()).toEqual(['app:vaultwarden', 'folder:users/hari', 'system']);
    t.restic.calls.length = 0;
    t.data(await t.d.mutate('backups.plan.update', { include: { apps: [], folders: [], includeNewApps: false } }));
    await run();
    expect(tags()).toEqual(['system']);
  });

  it('“Include new apps automatically”: on, a new app is ticked; off, it’s counted as not backed up', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    t.data(
      await t.d.mutate('backups.plan.update', {
        include: { apps: ['vaultwarden'], folders: [], includeNewApps: true },
      }),
    );
    t.app('immich');
    includeNew(t.db, { app: 'immich' });
    expect(t.data<Plan>(await t.d.query('backups.plan.get')).include.apps).toEqual(['vaultwarden', 'immich']);
    t.data(
      await t.d.mutate('backups.plan.update', {
        include: { apps: ['vaultwarden'], folders: [], includeNewApps: false },
      }),
    );
    t.app('jellyfin');
    includeNew(t.db, { app: 'jellyfin' });
    const o = t.data<{ included: { apps: number; notBackedUp: number } }>(await t.d.query('backups.overview'));
    expect(o.included).toMatchObject({ apps: 1, notBackedUp: 2 });
  });

  it('the estimate adds up what’s ticked', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    t.app('immich');
    const one = t.data<{ fullCopyBytes: number }>(
      await t.d.query('backups.plan.estimate', {
        include: { apps: ['vaultwarden'], folders: [], includeNewApps: true },
      }),
    );
    const both = t.data<{ fullCopyBytes: number }>(
      await t.d.query('backups.plan.estimate', {
        include: { apps: ['vaultwarden', 'immich'], folders: [], includeNewApps: true },
      }),
    );
    expect(one.fullCopyBytes).toBeGreaterThan(0);
    expect(both.fullCopyBytes).toBeGreaterThan(one.fullCopyBytes);
  });
});
