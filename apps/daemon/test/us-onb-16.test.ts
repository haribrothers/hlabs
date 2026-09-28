// US-ONB-16 · Use network storage (NAS), server side.
import { auditLog, getSetting, storageLocations } from '@hlabs/db';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileSecretStore } from '../src/platform/secrets';
import { daemonWithAdmin } from './admin-session';
import { FakeMounter } from './fakes/mounter';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const share = { protocol: 'smb', host: 'nas.local', share: 'media', username: 'hari', password: 's3cret' };

async function atStorage() {
  const mounter = new FakeMounter();
  const d = await daemonWithAdmin(closers, {}, { mounter });
  await d.mutate('onboarding.setStep', { step: 'storage' });
  return { ...d, mounter };
}

describe('US-ONB-16', () => {
  it('tests the connection by mounting, writing and unmounting', async () => {
    const d = await atStorage();
    expect((await d.mutate('storage.locations.testNetwork', share)).result?.data).toEqual({ ok: true });
    expect(d.mounter.shares).toEqual([
      expect.objectContaining({ host: 'nas.local', share: 'media', username: 'hari' }),
    ]);
    expect(d.mounter.mounted.size).toBe(0);
  });

  it('reports an unreachable NAS, a wrong login and a read-only share', async () => {
    const d = await atStorage();
    d.mounter.fail = 'NAS_UNREACHABLE';
    expect((await d.mutate('storage.locations.testNetwork', share)).error?.data.hlabsCode).toBe('NAS_UNREACHABLE');
    d.mounter.fail = 'NAS_AUTH_FAILED';
    expect((await d.mutate('storage.locations.testNetwork', share)).error?.data.hlabsCode).toBe('NAS_AUTH_FAILED');
    d.mounter.fail = null;
    d.mounter.readOnly = true;
    expect((await d.mutate('storage.locations.testNetwork', share)).error?.data.hlabsCode).toBe('NAS_READ_ONLY');
    expect(d.mounter.mounted.size).toBe(0);
  });

  it('adds the share with the password in the secret store, then makes it the root', async () => {
    const d = await atStorage();
    const { locationId } = (await d.mutate('storage.locations.addNetwork', share)).result!.data as {
      locationId: string;
    };
    const db = d.services!.db;
    const row = db.select().from(storageLocations).get()!;
    const mountPoint = join(d.config.paths.dataDir, 'mounts', locationId);
    expect(row).toMatchObject({
      id: locationId,
      kind: 'smb',
      name: 'nas.local/media',
      path: mountPoint,
      isRoot: false,
    });
    expect(JSON.parse(row.mountOptions!)).toEqual({ host: 'nas.local', share: 'media', username: 'hari' });
    expect(JSON.stringify(row)).not.toContain('s3cret');
    expect(await new FileSecretStore(d.config.paths.dataDir).get(row.secretRef!)).toBe('s3cret');
    expect(
      db
        .select()
        .from(auditLog)
        .all()
        .map((a) => a.action),
    ).toContain('storage.addNetwork');

    expect((await d.mutate('onboarding.setStorage', { kind: 'nas', locationId })).result?.data).toEqual({ ok: true });
    for (const dir of ['users/hari', 'shared', '.trash'])
      expect(statSync(join(mountPoint, dir)).isDirectory()).toBe(true);
    expect(db.select().from(storageLocations).all()).toEqual([
      expect.objectContaining({ id: locationId, isRoot: true }),
    ]);
    // App data stays on this computer (D-011).
    expect(d.config.paths.appDataDir.startsWith(mountPoint)).toBe(false);
    expect(getSetting(db, 'onboarding').step).toBe('done');
  });

  it('switching from this computer to the NAS leaves exactly one root', async () => {
    const d = await atStorage();
    await d.mutate('onboarding.setStorage', { kind: 'local' });
    const { locationId } = (await d.mutate('storage.locations.addNetwork', share)).result!.data as {
      locationId: string;
    };
    expect((await d.mutate('onboarding.setStorage', { kind: 'nas', locationId })).result?.data).toEqual({ ok: true });
    const rows = d.services!.db.select().from(storageLocations).all();
    expect(rows).toEqual([expect.objectContaining({ id: locationId, kind: 'smb', isRoot: true })]);
  });

  it('needs an admin session', async () => {
    const d = await atStorage();
    const res = await fetch(`${d.url}/trpc/storage.locations.testNetwork`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(share),
    });
    expect(((await res.json()) as { error: { data: { hlabsCode: string } } }).error.data.hlabsCode).toBe(
      'AUTH_REQUIRED',
    );
  });
});
