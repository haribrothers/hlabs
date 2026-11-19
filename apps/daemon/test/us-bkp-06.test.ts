// US-BKP-06 · Apply retention after each run (server side): forget --prune with the plan's retention after a
// success; a failed prune leaves the run succeeded and the destination needing attention; no prune after a failure.
import { backupDestinations, backupRuns } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { backupsDaemon } from './backups-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type T = Awaited<ReturnType<typeof backupsDaemon>>;
const backUp = async (t: T) => t.s.jobs.settled(t.data<{ jobId: string }>(await t.d.mutate('backups.runNow')).jobId);

describe('US-BKP-06', () => {
  it('after a successful run: forget --prune with 7 daily, 4 weekly and 6 monthly by default, or the plan’s', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    const nas = await t.nasDestination();
    await backUp(t);
    expect(t.restic.calls.filter((c) => c.op === 'forget')).toEqual([
      { op: 'forget', url: nas.repo, detail: { daily: 7, weekly: 4, monthly: 6 } },
    ]);
    t.data(await t.d.mutate('backups.plan.update', { retention: { daily: 3, weekly: 1, monthly: 0 } }));
    await backUp(t);
    expect(t.restic.calls.filter((c) => c.op === 'forget').at(-1)?.detail).toEqual({ daily: 3, weekly: 1, monthly: 0 });
    // Restore points counted from what's left.
    expect(t.db.select().from(backupDestinations).get()?.snapshotCount).toBe(2);
  });

  it('a failed prune: the run still succeeded, the destination needs attention until the next prune works', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    await t.nasDestination();
    t.restic.failNext('forget', 'BACKUP_REPO_LOCKED');
    expect((await backUp(t))?.state).toBe('succeeded');
    expect(t.db.select().from(backupRuns).get()?.status).toBe('succeeded');
    const status = async () =>
      t.data<{ destinations: Array<{ status: string }> }>(await t.d.query('backups.destinations.list')).destinations[0]!
        .status;
    expect(await status()).toBe('attention');
    await backUp(t);
    expect(await status()).toBe('ok');
  });

  it('no prune after a failed run', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    await t.nasDestination();
    t.restic.failNext('backup', 'BACKUP_DEST_FULL');
    expect((await backUp(t))?.state).toBe('failed');
    expect(t.restic.calls.filter((c) => c.op === 'forget')).toEqual([]);
  });
});
