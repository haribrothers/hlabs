// US-BKP-19 · Confirm a restore with my password (server side): a wrong password starts nothing; an exclusive task
// in the way is JOB_EXCLUSIVE_RUNNING; a restore is audited as backup.restore and returns its job.
import { auditLog, jobs, restores } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { backupsDaemon } from './backups-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-BKP-19', () => {
  it('a wrong password: AUTH_INVALID_PASSWORD and nothing starts; the right one: audited, a restore job', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    const nas = await t.nasDestination();
    const point = await t.backUp();
    const input = (password: string) => ({
      destinationId: nas.destinationId,
      snapshotId: point,
      scope: { mode: 'replace', apps: ['vaultwarden'], folders: [] },
      password,
    });
    expect(t.code(await t.d.mutate('backups.restore', input('nope')))).toBe('AUTH_INVALID_PASSWORD');
    expect(t.db.select().from(restores).all()).toEqual([]);
    const { jobId } = t.data<{ jobId: string }>(await t.d.mutate('backups.restore', input('correct horse battery')));
    expect(t.s.jobs.get(jobId)?.kind).toBe('restore');
    expect(t.db.select().from(auditLog).where(eq(auditLog.action, 'backup.restore')).all()).toEqual([
      expect.objectContaining({ detailJson: expect.objectContaining({ mode: 'replace', apps: ['vaultwarden'] }) }),
    ]);
    await t.s.jobs.settled(jobId);
  });

  it('while another task runs, a restore is JOB_EXCLUSIVE_RUNNING', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    const nas = await t.nasDestination();
    const point = await t.backUp();
    t.db
      .insert(jobs)
      .values({ id: ulid(), kind: 'app_update', state: 'running', progress: 0, createdAt: Date.now() })
      .run();
    const res = await t.d.mutate('backups.restore', {
      destinationId: nas.destinationId,
      snapshotId: point,
      scope: { mode: 'copy', apps: ['vaultwarden'], folders: [] },
      password: 'correct horse battery',
    });
    expect(res.error?.data.hlabsCode).toBe('JOB_EXCLUSIVE_RUNNING');
  });
});
