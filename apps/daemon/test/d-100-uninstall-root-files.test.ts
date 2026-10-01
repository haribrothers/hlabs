// The store matrix on Linux (D-100) found uninstall with data failing: apps write files in their data folder as root
// or another user, which hlabs can't delete there. hlabs then clears them from a container of the app's own image,
// run as root, and removes the rest.
import { apps } from '@hlabs/db';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
const locked: string[] = [];
afterEach(async () => {
  // Let the temp folders go even when a test failed.
  for (const dir of locked.splice(0)) if (existsSync(dir)) chmodSync(dir, 0o700);
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: { jobId: string } }; error?: unknown };

async function installedWithLockedData() {
  const t = await installDaemon(closers);
  const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
  await t.s.jobs.settled(res.result!.data.jobId);
  // A folder the app wrote that this user can't empty (as root-owned files are on Linux).
  const appData = join(t.s.config.paths.appDataDir, 'uptime-kuma');
  const ssh = join(appData, 'data', 'ssh');
  mkdirSync(ssh, { recursive: true });
  writeFileSync(join(ssh, 'host_key'), 'secret');
  chmodSync(ssh, 0o500);
  locked.push(ssh);
  return { ...t, appData };
}

describe("D-100 · uninstalling data hlabs can't delete itself", () => {
  it("clears it as root from the app's own image, then removes the folder", async () => {
    const t = await installedWithLockedData();
    const res = (await t.d.mutate('apps.uninstall', { appId: 'uptime-kuma', keepData: false })) as Reply;
    await t.s.jobs.settled(res.result!.data.jobId);
    expect(t.s.db.select().from(apps).all()).toEqual([]);
    expect(existsSync(t.appData)).toBe(false);
    expect(t.engine.cleared).toEqual([{ image: expect.stringContaining('louislam/uptime-kuma'), hostPath: t.appData }]);
  });

  it('an image without a shell is skipped; with none that can, the uninstall fails at the data step', async () => {
    const t = await installedWithLockedData();
    // Every image of the app has no shell.
    const compose = t.s.catalog.get('uptime-kuma')!.compose;
    for (const s of Object.values(compose.services)) t.engine.noShell.add(s.image!);
    const res = (await t.d.mutate('apps.uninstall', { appId: 'uptime-kuma', keepData: false })) as Reply;
    await t.s.jobs.settled(res.result!.data.jobId).catch(() => undefined);
    const app = t.s.db.select().from(apps).get()!;
    expect(app.state).toBe('error');
    expect(JSON.parse(app.stateDetail!)).toMatchObject({ step: 'data', uninstall: true });
  });
});
