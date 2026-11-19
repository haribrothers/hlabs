// US-BKP-09 · Test the connection and add the destination (server side): mapped errors, the repository made (or
// opened with its password when backups are already there), duplicates and the storage disk refused, the audit
// entry, a typed share connected with "Let apps use this drive" off.
import { auditLog, backupDestinations, storageLocations } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { backupsDaemon, PASSWORD } from './backups-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-BKP-09', () => {
  it('Add makes the repository with the password, lists the destination and writes backup.destination.add', async () => {
    const t = await backupsDaemon(closers);
    const nas = t.nasDrive();
    const res = await t.d.mutate('backups.destinations.add', {
      name: 'NAS',
      repoPassword: PASSWORD,
      target: { type: 'network', locationId: nas.id },
    });
    const { destinationId } = t.data<{ destinationId: string }>(res);
    expect(t.restic.repos.get(nas.repo)?.password).toBe(PASSWORD);
    expect(t.restic.calls.map((c) => c.op).slice(0, 2)).toEqual(['probe', 'init']);
    const { destinations } = t.data<{ destinations: Array<Record<string, unknown>> }>(
      await t.d.query('backups.destinations.list'),
    );
    expect(destinations).toEqual([
      expect.objectContaining({
        id: destinationId,
        kind: 'smb',
        name: 'NAS',
        location: 'nas.local/Backups',
        status: 'ok',
        offsite: false,
        hasKeys: false,
        busy: false,
      }),
    ]);
    expect(t.db.select().from(auditLog).where(eq(auditLog.action, 'backup.destination.add')).all()).toHaveLength(1);
  });

  it('mapped errors come back as their codes: wrong keys, unreachable, full', async () => {
    const t = await backupsDaemon(closers);
    const cloud = {
      name: 'B2',
      repoPassword: PASSWORD,
      target: { type: 'cloud', endpoint: 'https://s3.example.com', bucket: 'b', accessKey: 'a', secretKey: 's' },
    };
    t.restic.failNext('probe', 'BACKUP_DEST_AUTH_FAILED');
    expect(t.code(await t.d.mutate('backups.destinations.test', cloud))).toBe('BACKUP_DEST_AUTH_FAILED');
    t.restic.unreachable.add('s3:https://s3.example.com/b/hlabs-backups');
    expect(t.code(await t.d.mutate('backups.destinations.add', cloud))).toBe('BACKUP_DEST_UNREACHABLE');
    expect(t.db.select().from(backupDestinations).all()).toEqual([]);
  });

  it('backups already there: the right password opens them, a wrong one is BACKUP_REPO_PASSWORD_WRONG (existing)', async () => {
    const t = await backupsDaemon(closers);
    const nas = t.nasDrive();
    t.restic.seed(nas.repo, 'the-old-password-1');
    const add = (repoPassword: string) =>
      t.d.mutate('backups.destinations.add', {
        name: 'NAS',
        repoPassword,
        target: { type: 'network', locationId: nas.id },
      });
    const wrong = await add(PASSWORD);
    expect(wrong.error?.data).toMatchObject({ hlabsCode: 'BACKUP_REPO_PASSWORD_WRONG', detail: { existing: true } });
    expect(
      t.data(
        await t.d.mutate('backups.destinations.test', {
          name: 'NAS',
          repoPassword: 'the-old-password-1',
          target: { type: 'network', locationId: nas.id },
        }),
      ),
    ).toEqual({ existing: true });
    expect(t.data(await add('the-old-password-1'))).toHaveProperty('destinationId');
    // Opened, not made again.
    expect(t.restic.calls.filter((c) => c.op === 'init')).toEqual([]);
  });

  it('the same place twice is BACKUP_DEST_DUPLICATE; the disk hlabs keeps its data on is refused', async () => {
    const t = await backupsDaemon(closers);
    const nas = t.nasDrive();
    const input = { name: 'NAS', repoPassword: PASSWORD, target: { type: 'network', locationId: nas.id } };
    t.data(await t.d.mutate('backups.destinations.add', input));
    expect(t.code(await t.d.mutate('backups.destinations.add', { ...input, name: 'Again' }))).toBe(
      'BACKUP_DEST_DUPLICATE',
    );

    const sameDisk = {
      name: 'USB',
      repoPassword: PASSWORD,
      target: { type: 'external', drivePath: t.usb },
    };
    t.s.destinations.deviceOf = async () => 1;
    const res = await t.d.mutate('backups.destinations.test', sameDisk);
    expect(res.error?.data).toMatchObject({ hlabsCode: 'VALIDATION_FAILED', detail: { reason: 'sameDisk' } });
  });

  it('a share typed in the dialog is connected with “Let apps use this drive” off, and let go if adding fails', async () => {
    const t = await backupsDaemon(closers);
    const typed = (repoPassword: string) => ({
      name: 'Office',
      repoPassword,
      target: {
        type: 'network',
        address: { protocol: 'smb', host: 'office.local', share: 'Backups' },
        username: 'hari',
        password: 'p',
      },
    });
    t.restic.failNext('probe', 'BACKUP_DEST_FULL');
    expect(t.code(await t.d.mutate('backups.destinations.add', typed(PASSWORD)))).toBe('BACKUP_DEST_FULL');
    expect(t.db.select().from(storageLocations).where(eq(storageLocations.kind, 'smb')).all()).toEqual([]);

    t.data(await t.d.mutate('backups.destinations.add', typed(PASSWORD)));
    expect(t.db.select().from(storageLocations).where(eq(storageLocations.kind, 'smb')).all()).toEqual([
      expect.objectContaining({ name: 'Office · Backups', appsAllowed: false, autoMount: true }),
    ]);
  });
});
