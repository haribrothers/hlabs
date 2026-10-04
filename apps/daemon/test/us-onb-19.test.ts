// US-ONB-19 · Pick starter apps (the daemon's side): onboarding.starterApps lists the tiles with "needs more memory",
// and onboarding.installStarterApps queues one ordinary install per app with the manifest's defaults, only from the
// apps step (phase 2 onwards, D-036).
import { appMounts, apps, getSetting, jobs as jobsTable, setSetting } from '@hlabs/db';
import { BUILDING_PHASE, enabledOnboardingSteps, nextOnboardingStep, SHIPPED_PHASE } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string } } };

/** An admin at the apps step, with storage chosen, on phase 2. */
async function atAppsStep() {
  const t = await installDaemon(closers, { phase: 2 });
  setSetting(t.s.db, 'onboarding', { ...getSetting(t.s.db, 'onboarding'), completedAt: null, step: 'apps' });
  const starterApps = async () =>
    ((await t.d.query('onboarding.starterApps')) as Reply).result!.data.apps as Array<{
      app: { id: string; name: string };
      memoryBytes: number | null;
      needsMoreMemory: boolean;
    }>;
  return { ...t, starterApps };
}

describe('US-ONB-19', () => {
  it('phase 2 adds the apps step after storage (5 of 5 before phase 3); phase 1 goes straight to done', () => {
    expect(nextOnboardingStep('storage', 2)).toBe('apps');
    expect(nextOnboardingStep('apps', 2)).toBe('done');
    expect(nextOnboardingStep('storage', 1)).toBe('done');
    expect(enabledOnboardingSteps(2)).not.toContain('remote');
  });

  it("the daemon's onboarding follows the shipped phase, and the previewed one in development (D-092)", () => {
    expect(loadConfig({ NODE_ENV: 'production' }).phase).toBe(SHIPPED_PHASE);
    expect(loadConfig({ NODE_ENV: 'development' }).phase).toBe(Math.max(SHIPPED_PHASE, BUILDING_PHASE));
    expect(loadConfig({ NODE_ENV: 'development', HLABS_PREVIEW_PHASE: String(SHIPPED_PHASE + 1) }).phase).toBe(
      SHIPPED_PHASE + 1,
    );
  });

  it('choosing storage on phase 2 moves on to the apps step', async () => {
    const t = await installDaemon(closers, { phase: 2 });
    await t.d.mutate('onboarding.setStep', { step: 'storage' });
    await t.d.mutate('onboarding.setStorage', { kind: 'local' });
    expect(getSetting(t.s.db, 'onboarding').step).toBe('apps');
  });

  it('lists the starter apps in their order, with what memory each recommends', async () => {
    const t = await atAppsStep();
    // The fixture store has three of the eight.
    const list = await t.starterApps();
    expect(list.map((a) => a.app.id)).toEqual(['immich', 'vaultwarden', 'uptime-kuma']);
    expect(list.find((a) => a.app.id === 'immich')).toMatchObject({
      memoryBytes: 4096 * 2 ** 20,
      needsMoreMemory: false,
    });
  });

  it('an app that recommends more memory than the engine has free says so', async () => {
    const t = await atAppsStep();
    // An engine with 2 GB: it's read when the engine is found, so it goes away and comes back.
    t.engine.engineInfo = { ...t.engine.engineInfo, memoryBytes: 2e9 };
    t.engine.running = false;
    await t.s.engine.check();
    t.engine.running = true;
    await t.s.engine.check();
    const list = await t.starterApps();
    expect(list.find((a) => a.app.id === 'immich')?.needsMoreMemory).toBe(true);
    expect(list.find((a) => a.app.id === 'vaultwarden')?.needsMoreMemory).toBe(false);
  });

  it('Install and finish queues one install per app with the defaults: generated secrets, default folders', async () => {
    const t = await atAppsStep();
    const res = (await t.d.mutate('onboarding.installStarterApps', { appIds: ['immich', 'vaultwarden'] })) as Reply;
    const jobIds = res.result!.data.jobIds as string[];
    expect(jobIds).toHaveLength(2);
    const jobs = t.s.db.select().from(jobsTable).where(eq(jobsTable.kind, 'app_install')).all();
    expect(jobs.map((j) => j.target).sort()).toEqual(['immich', 'vaultwarden']);
    expect(
      t.s.db
        .select({ id: apps.id })
        .from(apps)
        .all()
        .map((a) => a.id)
        .sort(),
    ).toEqual(['immich', 'vaultwarden']);
    // Immich's photo library goes where the manifest says by default: the admin's Home.
    expect(t.s.db.select().from(appMounts).where(eq(appMounts.appId, 'immich')).all()).toEqual([
      expect.objectContaining({ target: 'library', storageLocationId: 'root', subpath: 'users/hari/Photos' }),
    ]);
    for (const id of jobIds) await t.s.jobs.settled(id);
    expect(t.s.db.select({ state: apps.state }).from(apps).all()).toEqual([{ state: 'running' }, { state: 'running' }]);
    // Onboarding then completes without waiting for them.
    expect((await t.d.mutate('onboarding.complete')).result?.data).toEqual({ redirectTo: '/' });
  });

  it('a second press gives the same jobs instead of installing twice', async () => {
    const t = await atAppsStep();
    const first = (await t.d.mutate('onboarding.installStarterApps', { appIds: ['vaultwarden'] })) as Reply;
    const again = (await t.d.mutate('onboarding.installStarterApps', { appIds: ['vaultwarden'] })) as Reply;
    expect(again.result!.data.jobIds).toEqual(first.result!.data.jobIds);
    await t.s.jobs.settled((first.result!.data.jobIds as string[])[0]!);
  });

  it('only starter apps, at least one, and only from the apps step', async () => {
    const t = await atAppsStep();
    const code = async (input: unknown) =>
      ((await t.d.mutate('onboarding.installStarterApps', input)) as Reply).error?.data.hlabsCode;
    expect(await code({ appIds: ['gitea'] })).toBe('VALIDATION_FAILED');
    expect(await code({ appIds: [] })).toBe('VALIDATION_FAILED');
    setSetting(t.s.db, 'onboarding', { ...getSetting(t.s.db, 'onboarding'), step: 'storage' });
    expect(await code({ appIds: ['vaultwarden'] })).toBe('ONBOARDING_STEP_INVALID');
  });
});

describe('US-ONB-20', () => {
  it('Skip completes onboarding from the apps step with no install jobs', async () => {
    const t = await atAppsStep();
    expect((await t.d.mutate('onboarding.complete')).result?.data).toEqual({ redirectTo: '/' });
    expect(t.s.db.select().from(jobsTable).where(eq(jobsTable.kind, 'app_install')).all()).toEqual([]);
    expect(getSetting(t.s.db, 'onboarding')).toMatchObject({ step: 'done' });
  });
});
