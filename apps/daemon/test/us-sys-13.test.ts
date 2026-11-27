// US-SYS-13 · Free space from unused app images (server side, D-168): hlabs records the images it pulls for an app, and
// "Free" removes only those, when no container on the engine uses them (of any program, running or stopped), no
// installed app names them, and they aren't an app's previous version within 7 days of its update. Images it didn't
// pull (the person's own) are never removed. The job says how much it freed and is audited.
import { appImages, apps, auditLog } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SNAPSHOT_DIR } from '../src/apps/update';
import { ROLLBACK_WINDOW_MS } from '../src/storage/images';
import { installDaemon } from './install-harness';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string; detail?: unknown } } };

const KUMA_ID = 'sha256:c74379ac4509ce2d2c2633f509e67003ee2e45b6e995c5e43fc101f45a0e1fbe';
const MB = 1e6;

async function setup() {
  const t = await installDaemon(closers);
  t.s.appWatch.stop();
  const install = async (appId: string) => {
    const res = (await t.d.mutate('apps.install', { appId })) as Reply;
    expect(res.error).toBeUndefined();
    await t.s.jobs.settled(res.result!.data.jobId as string);
  };
  const uninstall = async (appId: string) => {
    const res = (await t.d.mutate('apps.uninstall', { appId, keepData: false })) as Reply;
    expect(res.error).toBeUndefined();
    await t.s.jobs.settled(res.result!.data.jobId as string);
  };
  const reclaimable = async () =>
    ((await t.d.query('storage.summary')) as Reply).result!.data.reclaimableImageBytes as number;
  const prune = async () => {
    const res = (await t.d.mutate('storage.pruneImages')) as Reply;
    expect(res.error).toBeUndefined();
    const job = await t.s.jobs.settled(res.result!.data.jobId as string);
    return job!;
  };
  return { ...t, install, uninstall, reclaimable, prune };
}

/** Puts an image on the fake engine as if it had been pulled, with its size. */
function addImage(t: Awaited<ReturnType<typeof setup>>, ref: string, id: string, bytes: number) {
  t.engine.images.add(ref);
  t.engine.imageIds.set(ref, id);
  t.engine.imageSizes.set(id, bytes);
}

describe('US-SYS-13', () => {
  it('records the images an install pulls, but not one that was already on the engine', async () => {
    const t = await setup();
    t.engine.imageSizes.set(KUMA_ID, 150 * MB);
    await t.install('uptime-kuma');
    expect(t.s.db.select().from(appImages).all()).toEqual([
      expect.objectContaining({ imageId: KUMA_ID, appId: 'uptime-kuma', ref: expect.stringContaining('uptime-kuma') }),
    ]);
    // Vaultwarden's image was here before hlabs installed it: someone else's, so never recorded.
    const vaultwardenRef = t.s.catalog.get('vaultwarden')!.compose.services.vaultwarden!.image!;
    t.engine.images.add(vaultwardenRef);
    await t.install('vaultwarden');
    expect(t.s.db.select().from(appImages).where(eq(appImages.appId, 'vaultwarden')).all()).toEqual([]);
  });

  it("frees an uninstalled app's images, says how much, and audits it", async () => {
    const t = await setup();
    t.engine.imageSizes.set(KUMA_ID, 150 * MB);
    await t.install('uptime-kuma');
    // While it's installed, its image stays (its compose file names it).
    expect(await t.reclaimable()).toBe(0);
    await t.uninstall('uptime-kuma');
    expect(await t.reclaimable()).toBe(150 * MB);

    const job = await t.prune();
    expect(job.state).toBe('succeeded');
    expect(JSON.parse(job.message!)).toEqual({ freedBytes: 150 * MB });
    expect(t.engine.removedImages).toContain(KUMA_ID);
    expect(await t.engine.imageInfo(KUMA_ID)).toBeNull();
    expect(t.s.db.select().from(appImages).all()).toEqual([]);
    expect(t.s.db.select().from(auditLog).where(eq(auditLog.action, 'storage.prune_images')).get()).toMatchObject({
      userId: t.d.userId,
      detailJson: { count: 1, bytes: 150 * MB },
    });
    expect(await t.reclaimable()).toBe(0);
  });

  it("never removes the person's own images, nor one any container on the engine uses", async () => {
    const t = await setup();
    // The person's own: on the engine, unused, never recorded by hlabs.
    addImage(t, 'me/my-project:latest', 'sha256:mine', 500 * MB);
    // Pulled by hlabs for an app since uninstalled, but now another program's stopped container runs it.
    addImage(t, 'postgres:16', 'sha256:pg', 300 * MB);
    t.s.db.insert(appImages).values({ imageId: 'sha256:pg', appId: 'old-app', ref: 'postgres:16', pulledAt: 1 }).run();
    t.engine.otherContainerImages.add('sha256:pg');
    // Pulled by hlabs, unused by anything: the only one that may go.
    addImage(t, 'redis:7', 'sha256:redis', 40 * MB);
    t.s.db.insert(appImages).values({ imageId: 'sha256:redis', appId: 'old-app', ref: 'redis:7', pulledAt: 1 }).run();

    expect(await t.reclaimable()).toBe(40 * MB);
    const job = await t.prune();
    expect(JSON.parse(job.message!)).toEqual({ freedBytes: 40 * MB });
    expect(t.engine.removedImages).toEqual(['sha256:redis']);
    expect(t.engine.images.has('me/my-project:latest')).toBe(true);
    expect(t.engine.images.has('postgres:16')).toBe(true);
  });

  it("keeps an app's previous version for 7 days after an update, then lets it go", async () => {
    const t = await setup();
    t.engine.imageSizes.set(KUMA_ID, 150 * MB);
    await t.install('uptime-kuma');
    // The update kept 2.5.4's image for going back.
    addImage(t, 'louislam/uptime-kuma:2.5.4', 'sha256:kuma-old', 140 * MB);
    t.s.db
      .insert(appImages)
      .values({ imageId: 'sha256:kuma-old', appId: 'uptime-kuma', ref: 'louislam/uptime-kuma:2.5.4', pulledAt: 1 })
      .run();
    const dir = t.s.apps.project('uptime-kuma').dir;
    mkdirSync(join(dir, SNAPSHOT_DIR), { recursive: true });
    writeFileSync(join(dir, SNAPSHOT_DIR, 'digests.json'), JSON.stringify({ 'uptime-kuma': 'sha256:kuma-old' }));
    t.s.db
      .update(apps)
      .set({ previousVersion: '2.5.4', updatedAt: Date.now() - ROLLBACK_WINDOW_MS + 60_000 })
      .where(eq(apps.id, 'uptime-kuma'))
      .run();
    expect(await t.reclaimable()).toBe(0);

    t.s.db
      .update(apps)
      .set({ updatedAt: Date.now() - ROLLBACK_WINDOW_MS - 60_000 })
      .where(eq(apps.id, 'uptime-kuma'))
      .run();
    expect(await t.reclaimable()).toBe(140 * MB);
    await t.prune();
    expect(t.engine.removedImages).toEqual(['sha256:kuma-old']);
    // The version it runs stays.
    expect(await t.engine.imageInfo(KUMA_ID)).not.toBeNull();
  });

  it('an image gone already is forgotten; nothing to free without an engine; admins only', async () => {
    const t = await setup();
    t.s.db.insert(appImages).values({ imageId: 'sha256:gone', appId: 'x', ref: 'gone:1', pulledAt: 1 }).run();
    expect(await t.reclaimable()).toBe(0);
    expect(t.s.db.select().from(appImages).all()).toEqual([]);
    t.engine.running = false;
    expect(await t.reclaimable()).toBe(0);
    const anu = await memberSession(t.d);
    expect(((await anu.mutate('storage.pruneImages')) as Reply).error?.data.hlabsCode).toBe('ACCESS_DENIED');
  });
});
