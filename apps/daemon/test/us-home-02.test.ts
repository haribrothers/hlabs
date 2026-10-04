// US-HOME-02 · Glance at system widgets (server side): the default widgets and the storage summary.
import { apps } from '@hlabs/db';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppDisk } from '../src/apps/disk';
import { storageByUse, type StorageByUseDeps } from '../src/storage/by-use';
import { daemonWithAdmin } from './admin-session';
import { FakeSystemProbe } from './fakes/system';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-HOME-02', () => {
  it('a new admin gets Live usage, Storage, Remote access and Backups, in that order', async () => {
    const d = await daemonWithAdmin(closers);
    const layout = (await d.query('home.getLayout')).result!.data;
    expect(layout).toEqual({
      items: [
        { kind: 'widget', id: 'live-usage' },
        { kind: 'widget', id: 'storage' },
        { kind: 'widget', id: 'remote-access' },
        { kind: 'widget', id: 'backups' },
      ],
      dock: [],
    });
  });

  it("storage.summary: this computer's disk, free and in use", async () => {
    const d = await daemonWithAdmin(closers);
    expect((await d.query('storage.summary')).result!.data).toEqual({
      totalBytes: 256e9,
      freeBytes: 142e9,
      appsBytes: 0,
      filesBytes: 0,
      systemBytes: 114e9,
      hlabsBytes: 0,
      backupCacheBytes: 0,
      reclaimableImageBytes: 0,
    });
  });
});

describe('US-HOME-02 · storage by use', () => {
  const GB = 1e9;
  const disks: Record<string, AppDisk> = {
    immich: {
      dataBytes: 40 * GB,
      imageBytes: 3 * GB,
      images: [
        { id: 'sha256:base', bytes: 2 * GB },
        { id: 'sha256:immich', bytes: 1 * GB },
      ],
    },
    jellyfin: {
      dataBytes: 10 * GB,
      imageBytes: 2.5 * GB,
      images: [
        { id: 'sha256:base', bytes: 2 * GB },
        { id: 'sha256:jelly', bytes: 0.5 * GB },
      ],
    },
  };

  async function deps(extra: Partial<StorageByUseDeps> = {}) {
    const d = await daemonWithAdmin(closers);
    const db = d.services!.db;
    db.insert(apps)
      .values(
        ['immich', 'jellyfin'].map(
          (id) => ({ id, version: '1', state: 'running', hostname: id, installedAt: 1, updatedAt: 1 }) as never,
        ),
      )
      .run();
    const system = new FakeSystemProbe();
    return {
      d,
      system,
      deps: {
        db,
        system,
        disk: { get: async (id: string) => disks[id] ?? null },
        appDataDir: '/Users/hari/hlabs/app-data',
        engineKind: () => 'colima' as const,
        ...extra,
      } satisfies StorageByUseDeps,
    };
  }

  it('apps are their data and their images, an image they share counted once; system is the rest', async () => {
    const { deps: dd } = await deps();
    // 40 + 10 data, 2 + 1 + 0.5 images (the shared base once).
    expect(await storageByUse(dd, '/Users/hari/hlabs')).toEqual({
      totalBytes: 256 * GB,
      freeBytes: 142 * GB,
      usedBytes: 114 * GB,
      appsBytes: 53.5 * GB,
      filesBytes: 0,
      systemBytes: 60.5 * GB,
    });
  });

  it("only what's on this disk counts: app data elsewhere, or images in an engine on another disk, don't", async () => {
    const { system, deps: dd } = await deps({ appDataDir: '/Volumes/Fast/app-data' });
    system.disks.set('/Volumes/Fast', 'disk2');
    expect((await storageByUse(dd, '/Users/hari/hlabs')).appsBytes).toBe(3.5 * GB);
    expect((await storageByUse(dd, '/Volumes/Fast')).appsBytes).toBe(50 * GB);
    expect((await storageByUse({ ...dd, engineKind: () => null }, '/Users/hari/hlabs')).appsBytes).toBe(0);
  });

  it('an app still being counted counts 0 for now', async () => {
    const { deps: dd } = await deps({ disk: { get: async (id: string) => (id === 'immich' ? null : disks[id]!) } });
    expect((await storageByUse(dd, '/Users/hari/hlabs')).appsBytes).toBe(12.5 * GB);
  });

  it('storage.summary and usage.overview count installed apps', async () => {
    const d = await daemonWithAdmin(closers);
    const s = d.services!;
    s.db
      .insert(apps)
      .values({
        id: 'immich',
        version: '1',
        state: 'running',
        hostname: 'immich',
        installedAt: 1,
        updatedAt: 1,
      } as never)
      .run();
    const dir = join(s.config.paths.appDataDir, 'immich');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'photo.jpg'), Buffer.alloc(4096));
    const summary = (await d.query('storage.summary')).result!.data as { appsBytes: number; systemBytes: number };
    expect(summary.appsBytes).toBe(4096);
    expect(summary.systemBytes).toBe(114e9 - 4096);
    const overview = (await d.query('usage.overview')).result!.data as { storage: { appsBytes: number } };
    expect(overview.storage.appsBytes).toBe(4096);
  });
});
