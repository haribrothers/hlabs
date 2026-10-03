// US-SYS-25 · Update apps from Settings (server side): store.listUpdates lists installed apps with a newer store
// version, with that version's release notes, and the updates that rolled back; an app that updated drops off.
import type { StoreUpdates } from '@hlabs/api';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeProbes, installDaemon } from './install-harness';
import { memberSession } from './member-session';
import { storeFixture } from './store-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string } } };
const NEW_DIGEST = 'b'.repeat(64);

/** Uptime Kuma installed, then 9.9.9 in the store (another image, with release notes); `healthy` says if it starts. */
async function withNewVersion(healthy: (up: number) => boolean) {
  const storeDir = storeFixture();
  let ups = 0;
  const t = await installDaemon(closers, { storeDir, probes: fakeProbes(() => (healthy(ups) ? 200 : 500)) });
  const realUp = t.compose.up.bind(t.compose);
  t.compose.up = async (project) => {
    ups++;
    t.compose.serviceState.set('uptime-kuma', { health: healthy(ups) ? 'healthy' : 'unhealthy' });
    return realUp(project);
  };
  const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
  await t.s.jobs.settled(res.result!.data.jobId as string);
  const appDir = join(storeDir, 'apps', 'uptime-kuma');
  const manifest = readFileSync(join(appDir, 'hlabs-app.yml'), 'utf8')
    .replace(/^version: .*$/m, "version: '9.9.9'")
    .concat('\nreleaseNotes: |\n  - Status pages load faster\n  - New notification channels\n');
  writeFileSync(join(appDir, 'hlabs-app.yml'), manifest);
  const compose = readFileSync(join(appDir, 'docker-compose.yml'), 'utf8').replace(
    /@sha256:[0-9a-f]{64}/,
    `@sha256:${NEW_DIGEST}`,
  );
  writeFileSync(join(appDir, 'docker-compose.yml'), compose);
  t.s.catalog.syncBuiltin();
  const list = async () => ((await t.d.query('store.listUpdates')) as Reply).result!.data as unknown as StoreUpdates;
  const update = async () => {
    const r = (await t.d.mutate('apps.update', { appId: 'uptime-kuma' })) as Reply;
    await t.s.jobs.settled(r.result!.data.jobId as string).catch(() => undefined);
  };
  return { ...t, list, update };
}

describe('US-SYS-25 · Update apps from Settings', () => {
  it('lists the app with its versions and the new version’s notes; once updated it drops off', async () => {
    const t = await withNewVersion(() => true);
    const before = await t.list();
    expect(before.pending).toHaveLength(1);
    const [row] = before.pending;
    expect(row).toMatchObject({ appId: 'uptime-kuma', name: 'Uptime Kuma', toVersion: '9.9.9', state: 'running' });
    expect(row!.fromVersion).not.toBe('9.9.9');
    expect(row!.releaseNotes).toBe('- Status pages load faster\n- New notification channels');
    expect(before.rolledBack).toEqual([]);
    await t.update();
    expect((await t.list()).pending).toEqual([]);
  });

  it('an update that rolled back is listed as rolled back', async () => {
    // Up 1 (install) and 3 (going back) are healthy; up 2 (the update) isn't.
    const t = await withNewVersion((up) => up !== 2);
    await t.update();
    const after = await t.list();
    expect(after.rolledBack).toEqual([
      {
        appId: 'uptime-kuma',
        name: 'Uptime Kuma',
        fromVersion: expect.any(String),
        toVersion: '9.9.9',
        restored: true,
      },
    ]);
    // Its new version is still there to try again.
    expect(after.pending.map((p) => p.appId)).toEqual(['uptime-kuma']);
  });

  it('is for admins', async () => {
    const t = await withNewVersion(() => true);
    const anu = await memberSession(t.d);
    expect((await anu.query('store.listUpdates')).error?.data.hlabsCode).toBe('ACCESS_DENIED');
  });
});
