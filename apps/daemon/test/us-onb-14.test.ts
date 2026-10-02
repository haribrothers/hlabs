// US-ONB-14 · Keep data on this computer (server side), with onboarding.complete in phase 1.
import { auditLog, getSetting, storageLocations } from '@hlabs/db';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SETUP_TOKEN_REF } from '../src/onboarding/service';
import { FileSecretStore } from '../src/platform/secrets';
import { daemonWithAdmin } from './admin-session';
import { tempDir } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function atStorageStep(config = {}) {
  const d = await daemonWithAdmin(closers, config);
  await d.mutate('onboarding.setStep', { step: 'storage' });
  return d;
}

describe('US-ONB-14', () => {
  it('This computer creates the folders, registers the only root and moves on', async () => {
    const d = await atStorageStep();
    const root = d.config.paths.storageRootDefault;
    expect((await d.mutate('onboarding.setStorage', { kind: 'local' })).result?.data).toEqual({ ok: true });

    for (const dir of ['users/hari', 'shared', '.trash']) expect(statSync(join(root, dir)).isDirectory()).toBe(true);
    // App data lives separately, on this computer (D-011).
    expect(root).not.toBe(d.config.paths.appDataDir);
    const db = d.services!.db;
    expect(db.select().from(storageLocations).all()).toEqual([
      expect.objectContaining({ kind: 'local', name: 'This computer', path: root, isRoot: true }),
    ]);
    // Phase 1: remote access and starter apps aren't enabled, so the next step is done (D-041).
    // Phase 2: on to the starter apps.
    expect(getSetting(db, 'onboarding').step).toBe('apps');
  });

  it('choosing again reuses the folder and never deletes what is in it', async () => {
    const d = await atStorageStep();
    const root = d.config.paths.storageRootDefault;
    await d.mutate('onboarding.setStorage', { kind: 'local' });
    writeFileSync(join(root, 'shared', 'keep.txt'), 'mine');
    await d.mutate('onboarding.setStorage', { kind: 'local' });
    expect(existsSync(join(root, 'shared', 'keep.txt'))).toBe(true);
    expect(d.services!.db.select().from(storageLocations).all()).toHaveLength(1);
  });

  it('a folder that cannot be written is STORAGE_NOT_WRITABLE', async () => {
    const file = join(tempDir(), 'a-file');
    writeFileSync(file, '');
    const dataDir = tempDir();
    const d = await atStorageStep({
      paths: { dataDir, appDataDir: join(dataDir, 'app-data'), storageRootDefault: join(file, 'hlabs') },
    });
    expect((await d.mutate('onboarding.setStorage', { kind: 'local' })).error?.data.hlabsCode).toBe(
      'STORAGE_NOT_WRITABLE',
    );
    expect(d.services!.db.select().from(storageLocations).all()).toEqual([]);
  });

  it('then onboarding.complete finishes setup and retires the setup token', async () => {
    const d = await atStorageStep();
    expect((await d.mutate('onboarding.complete')).error?.data.hlabsCode).toBe('ONBOARDING_INCOMPLETE');
    await d.mutate('onboarding.setStorage', { kind: 'local' });
    expect((await d.mutate('onboarding.complete')).result?.data).toEqual({ redirectTo: '/' });

    const db = d.services!.db;
    expect(getSetting(db, 'onboarding')).toMatchObject({ step: 'done', setupTokenRef: null });
    expect(getSetting(db, 'onboarding').completedAt).toBeGreaterThan(0);
    expect(await new FileSecretStore(d.config.paths.dataDir).get(SETUP_TOKEN_REF)).toBeNull();
    expect(
      db
        .select()
        .from(auditLog)
        .all()
        .map((a) => a.action),
    ).toContain('onboarding.complete');
  });
});
