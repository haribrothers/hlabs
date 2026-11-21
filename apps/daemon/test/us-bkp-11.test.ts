// US-BKP-11 · Edit or remove a destination (server side): rename, new keys tested before saving, removal keeps the
// backups and the history, waits for a running backup, deletes the secrets and is audited.
import { auditLog, backupDestinations, backupRuns } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { backupsDaemon, PASSWORD } from './backups-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function withCloud(t: Awaited<ReturnType<typeof backupsDaemon>>) {
  return t.data<{ destinationId: string }>(
    await t.d.mutate('backups.destinations.add', {
      name: 'Backblaze',
      repoPassword: PASSWORD,
      target: {
        type: 'cloud',
        endpoint: 'https://s3.example.com',
        bucket: 'b',
        accessKey: 'old-access',
        secretKey: 'old-secret',
      },
    }),
  ).destinationId;
}

describe('US-BKP-11', () => {
  it('rename, and new keys only once they open the backups', async () => {
    const t = await backupsDaemon(closers);
    const destinationId = await withCloud(t);
    t.data(await t.d.mutate('backups.destinations.update', { destinationId, name: 'B2' }));
    t.restic.failNext('probe', 'BACKUP_DEST_AUTH_FAILED');
    expect(
      t.code(await t.d.mutate('backups.destinations.update', { destinationId, accessKey: 'bad', secretKey: 'bad' })),
    ).toBe('BACKUP_DEST_AUTH_FAILED');
    const row = () => t.db.select().from(backupDestinations).where(eq(backupDestinations.id, destinationId)).get()!;
    expect(row()).toMatchObject({ name: 'B2', configJson: expect.objectContaining({ accessKey: 'old-access' }) });
    expect(await t.s.secrets.get(`backup:${destinationId}:s3-secret`)).toBe('old-secret');

    t.data(
      await t.d.mutate('backups.destinations.update', {
        destinationId,
        accessKey: 'new-access',
        secretKey: 'new-secret',
      }),
    );
    expect(row().configJson).toMatchObject({ accessKey: 'new-access' });
    expect(await t.s.secrets.get(`backup:${destinationId}:s3-secret`)).toBe('new-secret');
    expect(JSON.stringify(row())).not.toContain('new-secret');
    expect(t.db.select().from(auditLog).where(eq(auditLog.action, 'backup.destination.update')).all()).toHaveLength(2);
  });

  it('remove keeps what’s at the destination and the runs, deletes the secrets and is audited', async () => {
    const t = await backupsDaemon(closers);
    const destinationId = await withCloud(t);
    const runId = ulid();
    t.db
      .insert(backupRuns)
      .values({ id: runId, destinationId, startedAt: 1, finishedAt: 2, status: 'succeeded', trigger: 'manual' })
      .run();
    t.data(await t.d.mutate('backups.destinations.remove', { destinationId }));
    expect(t.db.select().from(backupDestinations).all()).toEqual([]);
    expect(t.db.select().from(backupRuns).all()).toEqual([expect.objectContaining({ id: runId, destinationId: null })]);
    expect(t.restic.repos.size).toBe(1);
    expect(await t.s.secrets.get(`backup:${destinationId}:password`)).toBeNull();
    expect(await t.s.secrets.get(`backup:${destinationId}:s3-secret`)).toBeNull();
    expect(t.db.select().from(auditLog).where(eq(auditLog.action, 'backup.destination.remove')).all()).toHaveLength(1);
  });

  it('while a backup to it runs, remove waits', async () => {
    const t = await backupsDaemon(closers);
    const destinationId = await withCloud(t);
    t.db
      .insert(backupRuns)
      .values({ id: ulid(), destinationId, startedAt: Date.now(), status: 'running', trigger: 'manual' })
      .run();
    const { destinations } = t.data<{ destinations: Array<{ busy: boolean }> }>(
      await t.d.query('backups.destinations.list'),
    );
    expect(destinations[0]!.busy).toBe(true);
    expect(t.code(await t.d.mutate('backups.destinations.remove', { destinationId }))).toBe('JOB_EXCLUSIVE_RUNNING');
  });
});
