// US-STORE-08 · Choose folder access in the install sheet: defaults in store.getApp, and the folders apps.install takes.
import { appMounts, storageLocations } from '@hlabs/db';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installDaemon } from './install-harness';
import { tempDir } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test replies are read loosely
  result?: { data: Record<string, any> };
  error?: { data: { hlabsCode: string; detail?: Record<string, unknown> } };
};

const library = (extra: Record<string, unknown> = {}) => ({
  target: 'library',
  storageLocationId: 'root',
  subpath: 'users/hari/Photos',
  mode: 'rw',
  ...extra,
});

describe('US-STORE-08', () => {
  it('each folder comes with its default place for the person installing: Home › Photos', async () => {
    const t = await installDaemon(closers);
    const d = (await t.d.query(
      `store.getApp?input=${encodeURIComponent(JSON.stringify({ appId: 'immich' }))}`,
    )) as Reply;
    expect(d.result!.data.folders[0]).toMatchObject({
      key: 'library',
      mode: 'rw',
      required: true,
      default: {
        storageLocationId: 'root',
        subpath: 'users/hari/Photos',
        place: { area: 'home', locationName: null, path: 'Photos' },
        available: true,
      },
    });
  });

  it('a required folder must be given; paths can’t leave their location; unknown folders are refused', async () => {
    const t = await installDaemon(closers);
    const install = (mounts: unknown[]) => t.d.mutate('apps.install', { appId: 'immich', mounts }) as Promise<Reply>;
    expect((await install([])).error?.data).toMatchObject({
      hlabsCode: 'VALIDATION_FAILED',
      detail: { folder: 'library' },
    });
    expect((await install([library({ subpath: '../../etc' })])).error?.data.hlabsCode).toBe('VALIDATION_FAILED');
    expect((await install([library({ target: 'nope' })])).error?.data.hlabsCode).toBe('VALIDATION_FAILED');
    expect((await install([library({ storageLocationId: 'missing' })])).error?.data.hlabsCode).toBe('NOT_FOUND');
  });

  it('a folder on an offline NAS can’t be used', async () => {
    const t = await installDaemon(closers);
    const nas = join(tempDir(), 'nas');
    mkdirSync(nas);
    t.s.db.insert(storageLocations).values({ id: 'nas', kind: 'smb', name: 'NAS', path: nas, status: 'offline' }).run();
    const res = (await t.d.mutate('apps.install', {
      appId: 'immich',
      mounts: [library({ storageLocationId: 'nas', subpath: 'Photos archive' })],
    })) as Reply;
    expect(res.error?.data).toMatchObject({ hlabsCode: 'NAS_UNREACHABLE', detail: { location: 'NAS' } });
  });

  it('keeps the chosen folders, and a read-only folder stays read-only', async () => {
    const t = await installDaemon(closers);
    const { resolveMounts } = await import('../src/apps/folders');
    const manifest = t.s.catalog.get('immich')!.manifest;
    const ro = { ...manifest, folders: [{ ...manifest.folders[0]!, mode: 'ro' as const }] };
    expect(resolveMounts(t.s.db, ro, [library({ mode: 'rw' }) as never])[0]!.mode).toBe('ro');
    const res = (await t.d.mutate('apps.install', { appId: 'immich', mounts: [library()] })) as Reply;
    await t.s.jobs.settled(res.result!.data.jobId);
    expect(t.s.db.select().from(appMounts).all()).toEqual([
      expect.objectContaining({
        appId: 'immich',
        target: 'library',
        storageLocationId: 'root',
        subpath: 'users/hari/Photos',
        mode: 'rw',
      }),
    ]);
  });
});
