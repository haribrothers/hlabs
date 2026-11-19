// US-BKP-22 · Cancel a restore only before swap-in (server side): jobs.cancel while copying puts everything back and
// marks it cancelled; from swap-in on it's RESTORE_NOT_CANCELLABLE; while a restore runs, other jobs wait.
import { restores } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { backupsDaemon } from './backups-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-BKP-22', () => {
  it('cancelled while copying: current data back, the app started, the restore cancelled; backups wait meanwhile', async () => {
    const t = await backupsDaemon(closers);
    const { data } = t.app('vaultwarden');
    const nas = await t.nasDestination();
    const point = await t.backUp();
    writeFileSync(join(data, 'db', 'data.sqlite'), 'today');
    t.restic.gate = new Promise<void>(() => {});
    const seen = new Promise<void>((r) => (t.restic.onGate = r));
    const { jobId } = t.data<{ jobId: string }>(
      await t.d.mutate('backups.restore', {
        destinationId: nas.destinationId,
        snapshotId: point,
        scope: { mode: 'replace', apps: ['vaultwarden'], folders: [] },
        password: 'correct horse battery',
      }),
    );
    await seen;
    expect(t.code(await t.d.mutate('backups.runNow'))).toBe('JOB_EXCLUSIVE_RUNNING');
    t.data(await t.d.mutate('jobs.cancel', { jobId }));
    expect((await t.s.jobs.settled(jobId))?.state).toBe('cancelled');
    t.restic.gate = null;
    expect(readFileSync(join(data, 'db', 'data.sqlite'), 'utf8')).toBe('today');
    expect(t.appControl.calls).toEqual(['stop:vaultwarden', 'start:vaultwarden']);
    expect(t.db.select().from(restores).get()?.status).toBe('cancelled');
  });

  it('from swap-in on: RESTORE_NOT_CANCELLABLE', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    const nas = await t.nasDestination();
    const point = await t.backUp();
    t.restic.gate = new Promise<void>(() => {});
    const seen = new Promise<void>((r) => (t.restic.onGate = r));
    const { jobId } = t.data<{ jobId: string }>(
      await t.d.mutate('backups.restore', {
        destinationId: nas.destinationId,
        snapshotId: point,
        scope: { mode: 'replace', apps: ['vaultwarden'], folders: [] },
        password: 'correct horse battery',
      }),
    );
    await seen;
    t.db.update(restores).set({ phase: 'swap' }).where(eq(restores.jobId, jobId)).run();
    expect(t.code(await t.d.mutate('jobs.cancel', { jobId }))).toBe('RESTORE_NOT_CANCELLABLE');
    const view = t.data<{ cancellable: boolean }>(await t.d.query('backups.getRestore', { jobId }));
    expect(view.cancellable).toBe(false);
    t.db.update(restores).set({ phase: 'copying' }).where(eq(restores.jobId, jobId)).run();
    t.data(await t.d.mutate('jobs.cancel', { jobId }));
    await t.s.jobs.settled(jobId);
  });
});
