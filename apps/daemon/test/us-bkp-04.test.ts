// US-BKP-04 · Back up now (server side): a manual run to every destination; a second press gets the same job; an
// exclusive task refuses it; the tray's quick action does the same; a notification when it's done.
import { backupRuns, jobs, notifications } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { backupsDaemon } from './backups-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-BKP-04', () => {
  it('Back up now starts a manual run; pressed again while it runs, the same job comes back', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    await t.nasDestination();
    let release!: () => void;
    t.restic.gate = new Promise<void>((r) => (release = r));
    const first = t.data<{ jobId: string }>(await t.d.mutate('backups.runNow')).jobId;
    const second = t.data<{ jobId: string }>(await t.d.mutate('backups.runNow')).jobId;
    expect(second).toBe(first);
    const overview = t.data<{ running: { jobId: string } | null }>(await t.d.query('backups.overview'));
    expect(overview.running?.jobId).toBe(first);
    release();
    t.restic.gate = null;
    await t.s.jobs.settled(first);
    expect(
      t.db
        .select()
        .from(backupRuns)
        .all()
        .map((r) => r.trigger),
    ).toEqual(['manual']);
    expect(
      t.db
        .select()
        .from(notifications)
        .all()
        .filter((n) => n.kind === 'backup.succeeded'),
    ).toHaveLength(1);
  });

  it('with no destination it says so; during a restore it’s JOB_EXCLUSIVE_RUNNING', async () => {
    const t = await backupsDaemon(closers);
    expect(t.code(await t.d.mutate('backups.runNow'))).toBe('NOT_FOUND');
    await t.nasDestination();
    t.db
      .insert(jobs)
      .values({ id: ulid(), kind: 'restore', state: 'running', progress: 0, createdAt: Date.now() })
      .run();
    const res = await t.d.mutate('backups.runNow');
    expect(res.error?.data).toMatchObject({ hlabsCode: 'JOB_EXCLUSIVE_RUNNING', detail: { runningKind: 'restore' } });
    expect(t.data<{ blockedBy: string | null }>(await t.d.query('backups.overview')).blockedBy).toBe('restore');
  });

  it('the tray’s “Back up now” starts the same run', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    await t.nasDestination();
    const { jobId } = await t.s.backups.runNow();
    expect(t.s.jobs.get(jobId)?.kind).toBe('backup');
    await t.s.jobs.settled(jobId);
  });
});
