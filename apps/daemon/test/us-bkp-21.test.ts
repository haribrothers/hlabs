// US-BKP-21 · Roll back automatically if a restore fails (server side): a failed copy, or an app that doesn't come
// up after swap-in, puts the safety copy back and starts the app; not enough room refuses before stopping anything;
// a crash is settled on the next start.
import { restores } from '@hlabs/db';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { backupsDaemon } from './backups-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function setUp() {
  const t = await backupsDaemon(closers);
  const app = t.app('vaultwarden', { name: 'Vaultwarden' });
  const nas = await t.nasDestination();
  const point = await t.backUp();
  writeFileSync(join(app.data, 'db', 'data.sqlite'), 'today');
  const restore = async () =>
    t.d.mutate('backups.restore', {
      destinationId: nas.destinationId,
      snapshotId: point,
      scope: { mode: 'replace', apps: ['vaultwarden'], folders: [] },
      password: 'correct horse battery',
    });
  return { t, app, nas, point, restore };
}

describe('US-BKP-21', () => {
  it('copying fails: staging discarded, today’s data back, the app started, the restore failed with the reason', async () => {
    const { t, app, restore } = await setUp();
    t.restic.failNext('restore', 'BACKUP_DEST_UNREACHABLE');
    const { jobId } = t.data<{ jobId: string }>(await restore());
    expect((await t.s.jobs.settled(jobId))?.state).toBe('failed');
    expect(readFileSync(join(app.data, 'db', 'data.sqlite'), 'utf8')).toBe('today');
    expect(t.appControl.calls).toEqual(['stop:vaultwarden', 'start:vaultwarden']);
    const view = t.data<{ status: string; error: string; steps: Array<{ kind: string; state: string }> }>(
      await t.d.query('backups.getRestore', { jobId }),
    );
    expect(view).toMatchObject({ status: 'failed', error: 'BACKUP_DEST_UNREACHABLE' });
    expect(view.steps.map((s) => s.kind)).toContain('putBack');
  });

  it('the app doesn’t come up after swap-in: the safety copy goes back and it’s started again', async () => {
    const { t, app, restore } = await setUp();
    t.appControl.startFails.push('vaultwarden');
    const { jobId } = t.data<{ jobId: string }>(await restore());
    expect((await t.s.jobs.settled(jobId))?.state).toBe('failed');
    expect(readFileSync(join(app.data, 'db', 'data.sqlite'), 'utf8')).toBe('today');
    expect(t.appControl.calls).toEqual(['stop:vaultwarden', 'start:vaultwarden', 'start:vaultwarden']);
  });

  it('not enough room: DISK_FULL with what to free, before anything stops', async () => {
    const { t, restore } = await setUp();
    t.s.system.freeBytes = async () => 1;
    const res = await restore();
    expect(res.error?.data.hlabsCode).toBe('DISK_FULL');
    expect((res.error?.data.detail as { neededBytes: number }).neededBytes).toBeGreaterThan(0);
    expect(t.appControl.calls).toEqual([]);
  });

  it('a crash before swap-in rolls back; after swap-in it finishes', async () => {
    const { t, app } = await setUp();
    const work = join(t.s.config.paths.appDataDir, '.restore', 'r1');
    mkdirSync(join(work, 'safety'), { recursive: true });
    renameSync(app.data, join(work, 'safety', 'app-vaultwarden'));
    const scope = {
      mode: 'replace',
      apps: ['vaultwarden'],
      folders: [],
      pointTime: 1,
      wholeSystem: false,
      snaps: { 'app:vaultwarden': { snapshotId: 's', path: app.data, bytes: 1 } },
      systemSnap: null,
      copyFolder: null,
    };
    t.s.apps.transition('vaultwarden', 'stopping');
    t.s.apps.transition('vaultwarden', 'stopped');
    t.db
      .insert(restores)
      .values({
        id: 'r1',
        snapshotId: 'p',
        destinationId: null,
        scopeJson: scope,
        status: 'running',
        startedAt: 1,
        phase: 'copying',
      })
      .run();
    await t.s.restores.recover();
    expect(readFileSync(join(app.data, 'db', 'data.sqlite'), 'utf8')).toBe('today');
    expect(t.db.select().from(restores).get()).toMatchObject({ status: 'failed', error: 'BACKUP_INTERRUPTED' });
    expect(t.appControl.calls).toEqual(['start:vaultwarden']);

    // After swap-in: the staged data goes in and the app starts.
    const work2 = join(t.s.config.paths.appDataDir, '.restore', 'r2');
    mkdirSync(join(work2, 'staging', 'app-vaultwarden', 'db'), { recursive: true });
    writeFileSync(join(work2, 'staging', 'app-vaultwarden', 'db', 'data.sqlite'), 'restored');
    renameSync(app.data, join(t.s.config.paths.appDataDir, 'gone'));
    t.s.apps.transition('vaultwarden', 'stopping');
    t.s.apps.transition('vaultwarden', 'stopped');
    t.db
      .insert(restores)
      .values({
        id: 'r2',
        snapshotId: 'p',
        destinationId: null,
        scopeJson: scope,
        status: 'running',
        startedAt: 2,
        phase: 'swap',
      })
      .run();
    await t.s.restores.recover();
    expect(readFileSync(join(app.data, 'db', 'data.sqlite'), 'utf8')).toBe('restored');
    expect(
      t.db
        .select()
        .from(restores)
        .all()
        .find((r) => r.id === 'r2')?.status,
    ).toBe('succeeded');
  });
});
