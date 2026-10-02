// US-STORE-17 · Roll back an update that doesn't start: apps.update keeps the previous compose file, .env and image
// digests before pulling; a new version that doesn't come up healthy goes rolling_back and the previous one runs again,
// with nothing in the app's data touched; going back failing leaves it in error.
import { apps, auditLog, jobs as jobsTable, notifications } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { COMPOSE_FILE } from '../src/apps/compose';
import { ROLLED_BACK_KIND, RESTORE_FAILED_KIND, SNAPSHOT_DIR } from '../src/apps/update';
import { fakeProbes, installDaemon } from './install-harness';
import { storeFixture } from './store-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = {
  result?: { data: Record<string, unknown> };
  error?: { data: { hlabsCode: string } };
};
const NEW_DIGEST = 'e'.repeat(64);

/**
 * Uptime Kuma installed, then a newer version in the store with another image. `healthyUps` says which `compose up`s
 * (1 = install, 2 = the update, 3 = going back) come up healthy.
 */
async function withUpdate(healthyUps: (n: number) => boolean) {
  const storeDir = storeFixture();
  let ups = 0;
  const t = await installDaemon(closers, {
    storeDir,
    probes: fakeProbes(() => (healthyUps(ups) ? 200 : 500)),
  });
  const realUp = t.compose.up.bind(t.compose);
  t.compose.up = async (project) => {
    ups++;
    // Uptime Kuma's health is its container's healthcheck.
    t.compose.serviceState.set('uptime-kuma', { health: healthyUps(ups) ? 'healthy' : 'unhealthy' });
    return realUp(project);
  };
  const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
  await t.s.jobs.settled(res.result!.data.jobId as string);
  const project = t.s.apps.project('uptime-kuma');
  const before = {
    version: t.s.db.select().from(apps).get()!.version,
    compose: readFileSync(join(project.dir, COMPOSE_FILE), 'utf8'),
    digests: [...t.engine.containers.values()][0]!.map((c) => c.imageId),
    data: readdirSync(join(t.s.config.paths.appDataDir, 'uptime-kuma'), { recursive: true }).sort(),
  };
  // The store gets 9.9.9, with a different image.
  const appDir = join(storeDir, 'apps', 'uptime-kuma');
  const manifest = readFileSync(join(appDir, 'hlabs-app.yml'), 'utf8').replace(/^version: .*$/m, "version: '9.9.9'");
  writeFileSync(join(appDir, 'hlabs-app.yml'), manifest);
  const compose = readFileSync(join(appDir, 'docker-compose.yml'), 'utf8').replace(
    /@sha256:[0-9a-f]{64}/,
    `@sha256:${NEW_DIGEST}`,
  );
  writeFileSync(join(appDir, 'docker-compose.yml'), compose);
  t.s.catalog.syncBuiltin();
  const states: string[] = [];
  t.s.bus.on(({ event }) => {
    if (event.type === 'app.stateChanged') states.push(event.data.state);
  });
  const update = async () => {
    const r = (await t.d.mutate('apps.update', { appId: 'uptime-kuma' })) as Reply;
    const jobId = r.result!.data.jobId as string;
    await t.s.jobs.settled(jobId).catch(() => undefined);
    return t.s.db.select().from(jobsTable).where(eq(jobsTable.id, jobId)).get()!;
  };
  const get = async () =>
    ((await t.d.query(`apps.get?input=${encodeURIComponent(JSON.stringify({ appId: 'uptime-kuma' }))}`)) as Reply)
      .result!.data;
  return { ...t, project, before, states, update, get };
}

describe('US-STORE-17', () => {
  it('an update keeps the previous version first, then runs the new one', async () => {
    const t = await withUpdate(() => true);
    const job = await t.update();
    expect(job.state).toBe('succeeded');
    const app = t.s.db.select().from(apps).get()!;
    expect(app).toMatchObject({ state: 'running', version: '9.9.9', previousVersion: t.before.version });
    expect([...t.engine.containers.values()][0]!.map((c) => c.imageId)).toContain(`sha256:${NEW_DIGEST}`);
    // What was kept before pulling: the compose file, .env, manifest and the digests that ran.
    const kept = join(t.project.dir, SNAPSHOT_DIR);
    expect(readFileSync(join(kept, COMPOSE_FILE), 'utf8')).toBe(t.before.compose);
    expect(existsSync(join(kept, '.env'))).toBe(true);
    expect(Object.values(JSON.parse(readFileSync(join(kept, 'digests.json'), 'utf8')))).toEqual(t.before.digests);
    expect(t.states).toEqual(['updating', 'running']);
    expect(t.s.db.select().from(auditLog).where(eq(auditLog.action, 'app.update')).all()).toHaveLength(1);
  });

  it("a new version that doesn't start is rolled back: the old digests run again and no data changed", async () => {
    const t = await withUpdate((n) => n !== 2);
    const job = await t.update();
    expect(job).toMatchObject({ state: 'failed' });
    expect(t.states).toEqual(['updating', 'rolling_back', 'running']);
    const app = t.s.db.select().from(apps).get()!;
    expect(app).toMatchObject({ state: 'running', version: t.before.version });
    expect([...t.engine.containers.values()][0]!.map((c) => c.imageId)).toEqual(t.before.digests);
    expect(readFileSync(join(t.project.dir, COMPOSE_FILE), 'utf8')).toBe(t.before.compose);
    expect(readdirSync(join(t.s.config.paths.appDataDir, 'uptime-kuma'), { recursive: true }).sort()).toEqual(
      t.before.data,
    );
    expect(t.s.db.select().from(notifications).where(eq(notifications.kind, ROLLED_BACK_KIND)).get()).toMatchObject({
      severity: 'warning',
      title: "Uptime Kuma's update didn't start, so hlabs rolled it back",
      body: `It's running ${t.before.version} again.`,
    });
    expect((await t.get()).rolledBack).toMatchObject({
      restored: true,
      fromVersion: t.before.version,
      toVersion: '9.9.9',
      jobId: job.id,
    });
  });

  it('the banner is there by the time the app is running again (its notification comes first)', async () => {
    const t = await withUpdate((n) => n !== 2);
    let seenAtRunning: number | null = null;
    t.s.bus.on(({ event }) => {
      if (event.type === 'app.stateChanged' && event.data.state === 'running' && t.states.includes('rolling_back')) {
        seenAtRunning = t.s.db
          .select()
          .from(notifications)
          .where(eq(notifications.kind, ROLLED_BACK_KIND))
          .all().length;
      }
    });
    await t.update();
    expect(seenAtRunning).toBe(1);
  });

  it('"Try again" is just another update; dismissing the banner (the notification read) hides it for good', async () => {
    const t = await withUpdate((n) => n !== 2);
    await t.update();
    // Another rollback later: the banner is about the latest one, and dismissing it doesn't bring back the older one.
    await new Promise((r) => setTimeout(r, 2));
    const latest = t.s.updates.notifyRolledBack({
      appId: 'uptime-kuma',
      name: 'Uptime Kuma',
      fromVersion: t.before.version,
      toVersion: '9.9.9',
      restored: true,
    });
    const { rolledBack } = (await t.get()) as { rolledBack: { notificationId: string } };
    expect(rolledBack.notificationId).toBe(latest);
    await t.d.mutate('notifications.markRead', { ids: [latest] });
    expect((await t.get()).rolledBack).toBeNull();
    expect((await t.update()).state).toBe('succeeded');
  });

  it("when going back fails too, the app is in error and the admins are told it couldn't be restored", async () => {
    const t = await withUpdate((n) => n === 1);
    const job = await t.update();
    expect(job.state).toBe('failed');
    expect(t.states).toEqual(['updating', 'rolling_back', 'error']);
    expect(t.s.db.select().from(apps).get()?.state).toBe('error');
    expect(t.s.db.select().from(notifications).where(eq(notifications.kind, RESTORE_FAILED_KIND)).get()).toMatchObject({
      severity: 'critical',
      title: "Uptime Kuma couldn't be restored",
    });
    expect((await t.get()).rolledBack).toMatchObject({ restored: false });
  });

  it('nothing to update, or an app that is busy, is refused', async () => {
    const t = await withUpdate(() => true);
    await t.update();
    const again = (await t.d.mutate('apps.update', { appId: 'uptime-kuma' })) as Reply;
    expect(again.error?.data.hlabsCode).toBe('VALIDATION_FAILED');
  });
});
