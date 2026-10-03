// US-APP-07 · Storage, resources and version: where the app's data lives, its disk use (data folder plus images,
// counted at most every 10 minutes) and whether the store has a newer version.
import { apps, catalogApps } from '@hlabs/db';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDiskUsage, DISK_CACHE_MS, folderBytes } from '../src/apps/disk';
import { tildePath } from '../src/apps/install';
import { FakeEngine } from './fakes/engine';
import { tempDir } from './helpers';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> } };

describe('US-APP-07', () => {
  it('the data folder is shown from the home folder as ~', () => {
    expect(tildePath('/Users/hari/hlabs/app-data/vaultwarden', '/Users/hari')).toBe('~/hlabs/app-data/vaultwarden');
    expect(tildePath('/Volumes/Data/hlabs/app-data/vaultwarden', '/Users/hari')).toBe(
      '/Volumes/Data/hlabs/app-data/vaultwarden',
    );
    expect(tildePath('/Users/harish/app-data', '/Users/hari')).toBe('/Users/harish/app-data');
  });

  it('disk use is the data folder plus the images, kept for 10 minutes', async () => {
    const root = tempDir('appdata-');
    mkdirSync(join(root, 'vaultwarden', 'db'), { recursive: true });
    writeFileSync(join(root, 'vaultwarden', 'db', 'data.sqlite'), Buffer.alloc(4000));
    writeFileSync(join(root, 'vaultwarden', 'config.json'), Buffer.alloc(1000));
    const engine = new FakeEngine();
    engine.containers.set('hlabs-vaultwarden', [
      {
        id: 'c1',
        service: 'vaultwarden',
        state: 'running',
        health: null,
        image: 'vw',
        imageId: 'sha256:a',
        startedAt: 1,
        exitCode: null,
      },
      {
        id: 'c2',
        service: 'backup',
        state: 'running',
        health: null,
        image: 'vw',
        imageId: 'sha256:a',
        startedAt: 1,
        exitCode: null,
      },
    ]);
    engine.imageSizes.set('sha256:a', 90_000);
    let now = 0;
    const disk = new AppDiskUsage({
      appDataDir: root,
      engine: { client: engine },
      project: (id) => `hlabs-${id}`,
      now: () => now,
    });
    expect(await disk.get('vaultwarden')).toEqual({
      dataBytes: 5000,
      imageBytes: 90_000,
      images: [{ id: 'sha256:a', bytes: 90_000 }],
    });
    writeFileSync(join(root, 'vaultwarden', 'more.bin'), Buffer.alloc(2000));
    now = DISK_CACHE_MS - 1;
    expect((await disk.get('vaultwarden'))?.dataBytes).toBe(5000);
    now = DISK_CACHE_MS + 1;
    expect((await disk.get('vaultwarden'))?.dataBytes).toBe(7000);
  });

  it('a first count that takes a while answers null and carries on in the background', async () => {
    const root = tempDir('appdata-');
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    const engine = new FakeEngine();
    const client = Object.assign(Object.create(engine) as FakeEngine, {
      projectContainers: async () => (await slow, []),
    });
    const disk = new AppDiskUsage({ appDataDir: root, engine: { client }, project: (id) => id, waitMs: 10 });
    expect(await disk.get('immich')).toBeNull();
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(await disk.get('immich')).toEqual({ dataBytes: 0, imageBytes: 0, images: [] });
  });

  it("a folder that doesn't exist counts as 0", async () => {
    expect(await folderBytes(join(tempDir('none-'), 'missing'))).toBe(0);
  });

  it('apps.get gives the data folder, disk use, the version and the newer one in the store', async () => {
    const t = await installDaemon(closers);
    const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
    await t.s.jobs.settled(res.result!.data.jobId as string);
    const get = async () =>
      ((await t.d.query(`apps.get?input=${encodeURIComponent(JSON.stringify({ appId: 'uptime-kuma' }))}`)) as Reply)
        .result!.data;
    const version = t.s.db.select().from(apps).get()!.version;
    const first = await get();
    expect(first).toMatchObject({ version, latestVersion: null, disk: { dataBytes: expect.any(Number) } });
    expect(first.dataFolder).toMatch(/app-data\/uptime-kuma$/);
    t.s.db.update(catalogApps).set({ version: '9.9.9' }).run();
    expect(await get()).toMatchObject({ version, latestVersion: '9.9.9' });
  });
});
