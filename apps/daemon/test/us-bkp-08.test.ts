// US-BKP-08 · Choose a destination type and fill in its details (server side): cloud storage (https endpoint, bucket,
// keys), a network drive (connected, or a share address), an external drive; members can't reach backups.*.
import { afterEach, describe, expect, it } from 'vitest';
import { backupsDaemon, PASSWORD } from './backups-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const cloud = (extra: Record<string, unknown> = {}) => ({
  name: 'Backblaze',
  repoPassword: PASSWORD,
  target: {
    type: 'cloud',
    endpoint: 'https://s3.eu-central-003.backblazeb2.com',
    bucket: 'hlabs-backups',
    accessKey: '003a1f2c9e',
    secretKey: 'secret-key',
    ...extra,
  },
});

describe('US-BKP-08', () => {
  it('cloud storage needs an https endpoint, a bucket and both keys; its repository is the bucket’s hlabs-backups', async () => {
    const t = await backupsDaemon(closers);
    expect(t.code(await t.d.mutate('backups.destinations.test', cloud({ endpoint: 'http://s3.example.com' })))).toBe(
      'VALIDATION_FAILED',
    );
    expect(t.code(await t.d.mutate('backups.destinations.test', cloud({ bucket: '' })))).toBe('VALIDATION_FAILED');
    expect(t.code(await t.d.mutate('backups.destinations.test', cloud({ secretKey: '' })))).toBe('VALIDATION_FAILED');
    expect(t.data(await t.d.mutate('backups.destinations.test', cloud()))).toEqual({ existing: false });
    expect(t.restic.calls.at(-1)).toMatchObject({
      op: 'probe',
      url: 's3:https://s3.eu-central-003.backblazeb2.com/hlabs-backups/hlabs-backups',
    });
  });

  it('a network drive is one already connected, or a share address tested like Connect a drive', async () => {
    const t = await backupsDaemon(closers);
    const nas = t.nasDrive();
    const viaLocation = { name: 'NAS', repoPassword: PASSWORD, target: { type: 'network', locationId: nas.id } };
    expect(t.data(await t.d.mutate('backups.destinations.test', viaLocation))).toEqual({ existing: false });
    expect(t.restic.calls.at(-1)).toMatchObject({ op: 'probe', url: nas.repo });

    const typed = {
      name: 'Office NAS',
      repoPassword: PASSWORD,
      target: {
        type: 'network',
        address: { protocol: 'smb', host: 'office.local', share: 'Backups' },
        username: 'hari',
        password: 'nas-pass',
      },
    };
    expect(t.data(await t.d.mutate('backups.destinations.test', typed))).toEqual({ existing: false });
    // Mounted somewhere temporary with the credentials, then let go.
    expect(t.mounter.shares.at(-1)).toMatchObject({ host: 'office.local', share: 'Backups', username: 'hari' });
    expect(t.mounter.mounted.size).toBe(0);
    t.mounter.fail = 'NAS_AUTH_FAILED';
    expect(t.code(await t.d.mutate('backups.destinations.test', typed))).toBe('NAS_AUTH_FAILED');
  });

  it('an external drive is one of the connected drives, with a folder name (hlabs-backups by default)', async () => {
    const t = await backupsDaemon(closers);
    const ext = { name: 'Backup disk', repoPassword: PASSWORD, target: { type: 'external', drivePath: t.usb } };
    expect(t.data(await t.d.mutate('backups.destinations.test', ext))).toEqual({ existing: false });
    expect(t.restic.calls.at(-1)).toMatchObject({ url: `${t.usb}/hlabs-backups` });
    const gone = { ...ext, target: { type: 'external', drivePath: '/Volumes/Nope' } };
    expect(t.code(await t.d.mutate('backups.destinations.test', gone))).toBe('BACKUP_DEST_UNREACHABLE');
  });

  it('“Another hlabs” isn’t a type yet (D-132)', async () => {
    const t = await backupsDaemon(closers);
    const hlabs = { name: 'Other', repoPassword: PASSWORD, target: { type: 'hlabs', host: 'other' } };
    expect(t.code(await t.d.mutate('backups.destinations.test', hlabs))).toBe('VALIDATION_FAILED');
  });

  it('a member gets FORBIDDEN from backups.*', async () => {
    const t = await backupsDaemon(closers);
    const res = await t.anu.query('backups.destinations.list');
    expect(res.status).toBe(403);
    expect((await t.anu.mutate('backups.destinations.add', cloud())).status).toBe(403);
  });
});
