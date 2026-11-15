// US-APP-25 · Reinstall runs and keeps the data: the app goes reinstalling at once; the job takes its stack down,
// removes and pulls its images again, writes its compose file with the same settings, starts it and waits until it's
// healthy. Its data, .env, sharing and Home place are never touched. It's refused before anything stops when it
// can't run, and a failed step leaves the app in error with a way to try again.
import { appAccess, apps, auditLog, homeLayout, notifications, setSetting, users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { COMPOSE_FILE, ENV_FILE } from '../src/apps/compose';
import { REINSTALL_FAILED_KIND, REINSTALLED_KIND } from '../src/apps/reinstall';
import { MANIFEST_COPY } from '../src/apps/service';
import { installDaemon } from './install-harness';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string; detail?: unknown } } };

const IMMICH = {
  appId: 'immich',
  mounts: [{ target: 'library', storageLocationId: 'root', subpath: 'users/hari/Photos', mode: 'rw' }],
};

async function installed() {
  const t = await installDaemon(closers);
  t.s.appWatch.stop();
  const res = (await t.d.mutate('apps.install', IMMICH)) as Reply;
  await t.s.jobs.settled(res.result!.data.jobId as string);
  expect(t.s.apps.get('immich')!.state).toBe('running');
  const project = t.s.apps.project('immich');
  const dataDir = join(t.s.config.paths.appDataDir, 'immich');
  const envText = () => readFileSync(join(project.dir, ENV_FILE), 'utf8');
  const events: string[] = [];
  t.s.bus.on(({ event }) => {
    if (event.type === 'app.stateChanged' && event.data.appId === 'immich') events.push(event.data.state);
  });
  const reinstall = async () => (await t.d.mutate('apps.reinstall', { appId: 'immich' })) as Reply;
  const state = () => t.s.apps.get('immich')!.state;
  const told = (kind: string) => t.s.db.select().from(notifications).where(eq(notifications.kind, kind)).all();
  return { ...t, project, dataDir, envText, events, reinstall, state, told };
}

describe('US-APP-25', () => {
  it('rebuilds the app and keeps its data, settings, passwords, sharing and Home place', async () => {
    const t = await installed();
    // Its data, a member it's shared with and a place on their Home and Dock.
    mkdirSync(t.dataDir, { recursive: true });
    writeFileSync(join(t.dataDir, 'library.db'), 'photos');
    const member = ulid();
    t.s.db
      .insert(users)
      .values({ id: member, username: 'anu', displayName: 'Anu', role: 'member', passwordHash: 'x', createdAt: 1 })
      .run();
    t.s.db.insert(appAccess).values({ appId: 'immich', userId: member }).run();
    t.s.db
      .insert(homeLayout)
      .values({ userId: member, itemsJson: [{ kind: 'app', id: 'immich' }], dockJson: ['immich'] })
      .run();
    const env = t.envText();
    const imagesBefore = [...t.engine.images];
    // A damaged compose file is written again from the installed version.
    writeFileSync(join(t.project.dir, COMPOSE_FILE), 'services: {}\n');
    t.compose.calls.length = 0;
    const pullsBefore = t.engine.pulls.length;

    const res = await t.reinstall();
    expect(res.error).toBeUndefined();
    await t.s.jobs.settled(res.result!.data.jobId as string);

    expect(t.state()).toBe('running');
    expect(t.events).toEqual(['reinstalling', 'starting', 'running']);
    expect(t.compose.calls.map((c) => c.op)).toEqual(['down', 'up']);
    expect(t.engine.removedImages.sort()).toEqual(imagesBefore.sort());
    expect(t.engine.pulls.slice(pullsBefore).sort()).toEqual(imagesBefore.sort());
    expect(readFileSync(join(t.project.dir, COMPOSE_FILE), 'utf8')).toContain('immich');
    // Nothing of its own was touched.
    expect(readFileSync(join(t.dataDir, 'library.db'), 'utf8')).toBe('photos');
    expect(t.envText()).toBe(env);
    expect(t.s.db.select().from(appAccess).where(eq(appAccess.appId, 'immich')).all()).toHaveLength(1);
    expect(t.s.db.select().from(homeLayout).where(eq(homeLayout.userId, member)).get()!.dockJson).toEqual(['immich']);
    const row = t.s.db.select().from(apps).where(eq(apps.id, 'immich')).get()!;
    expect(row).toMatchObject({ autostart: true, hostname: 'immich' });
    // Recorded and told.
    expect(t.s.db.select().from(auditLog).where(eq(auditLog.action, 'app.reinstall')).all()).toEqual([
      expect.objectContaining({ target: 'immich', detailJson: { version: row.version } }),
    ]);
    expect(t.told(REINSTALLED_KIND)).toEqual([
      expect.objectContaining({ severity: 'success', title: 'Immich was reinstalled', target: 'immich' }),
    ]);
  });

  it('a stopped app ends running', async () => {
    const t = await installed();
    await t.s.apps.stop('immich');
    const res = await t.reinstall();
    await t.s.jobs.settled(res.result!.data.jobId as string);
    expect(t.state()).toBe('running');
  });

  it('a broken app (error) can be reinstalled', async () => {
    const t = await installed();
    t.s.apps.transition('immich', 'error', JSON.stringify({ code: 'APP_CRASHED', service: 'server' }));
    const res = await t.reinstall();
    await t.s.jobs.settled(res.result!.data.jobId as string);
    expect(t.state()).toBe('running');
  });

  it('the app is reinstalling at once, before the job gets going', async () => {
    const t = await installed();
    let open!: () => void;
    t.compose.gate = new Promise<void>((r) => (open = r));
    const res = await t.reinstall();
    expect(t.state()).toBe('reinstalling');
    open();
    t.compose.gate = null;
    await t.s.jobs.settled(res.result!.data.jobId as string);
  });

  it('a second call while one runs returns the same job', async () => {
    const t = await installed();
    let open!: () => void;
    t.compose.gate = new Promise<void>((r) => (open = r));
    const first = await t.reinstall();
    const second = await t.reinstall();
    expect(second.result!.data.jobId).toBe(first.result!.data.jobId);
    open();
    t.compose.gate = null;
    await t.s.jobs.settled(first.result!.data.jobId as string);
  });

  it('refused with APP_BUSY from a state that can’t reinstall, and while apps are paused', async () => {
    const t = await installed();
    t.s.apps.transition('immich', 'stopping');
    expect((await t.reinstall()).error?.data.hlabsCode).toBe('APP_BUSY');
    t.s.apps.transition('immich', 'stopped');
    setSetting(t.s.db, 'paused', { at: 1, appIds: ['immich'], untilRestart: false });
    expect((await t.reinstall()).error?.data.hlabsCode).toBe('APP_BUSY');
    expect(t.state()).toBe('stopped');
  });

  it('refused with ENGINE_UNAVAILABLE without the engine', async () => {
    const t = await installed();
    t.engine.running = false;
    await t.s.engine.check();
    expect((await t.reinstall()).error?.data.hlabsCode).toBe('ENGINE_UNAVAILABLE');
  }, 15_000);

  it('without its .env (its passwords) it is refused before anything stops, and apps.get says why', async () => {
    const t = await installed();
    rmSync(join(t.project.dir, ENV_FILE));
    t.compose.calls.length = 0;
    const res = await t.reinstall();
    expect(res.error?.data).toMatchObject({
      hlabsCode: 'APP_REINSTALL_UNAVAILABLE',
      detail: { appId: 'immich', missing: 'settings' },
    });
    expect(t.compose.calls).toEqual([]);
    expect(t.state()).toBe('running');
    const got = (await t.d.query('apps.get', { appId: 'immich' })) as Reply;
    expect(got.result!.data.reinstall).toMatchObject({ blocked: 'settings_missing' });
  });

  it('without its manifest copy it reinstalls from the store, which lists the same version', async () => {
    const t = await installed();
    rmSync(join(t.project.dir, MANIFEST_COPY));
    const res = await t.reinstall();
    await t.s.jobs.settled(res.result!.data.jobId as string);
    expect(t.state()).toBe('running');
    expect(existsSync(join(t.project.dir, MANIFEST_COPY))).toBe(true);
  });

  it('a failed step leaves it in error with the step, its data as it was, and "Try again"', async () => {
    const t = await installed();
    mkdirSync(t.dataDir, { recursive: true });
    writeFileSync(join(t.dataDir, 'library.db'), 'photos');
    t.compose.fail('up', t.project.name);
    const res = await t.reinstall();
    await t.s.jobs.settled(res.result!.data.jobId as string).catch(() => undefined);
    expect(t.state()).toBe('error');
    expect(JSON.parse(t.s.apps.get('immich')!.stateDetail!)).toMatchObject({ step: 'starting', reinstall: true });
    expect(readFileSync(join(t.dataDir, 'library.db'), 'utf8')).toBe('photos');
    const [n] = t.told(REINSTALL_FAILED_KIND);
    expect(n).toMatchObject({ severity: 'warning', title: "Immich couldn't be reinstalled", userId: null });
    expect(n!.actionJson).toEqual([
      { kind: 'mutation', procedure: 'apps.reinstall', input: { appId: 'immich' }, label: 'Try again' },
      { kind: 'navigate', to: '/apps/immich/logs' },
    ]);
  });

  it('hlabs stopping mid-reinstall leaves the app in error, to try again', async () => {
    const t = await installed();
    t.s.apps.transition('immich', 'reinstalling');
    await t.s.apps.reconcile();
    expect(t.state()).toBe('error');
    expect(JSON.parse(t.s.apps.get('immich')!.stateDetail!)).toMatchObject({ reason: 'restarted', reinstall: true });
  });

  it('members can’t reinstall and never see what a reinstall would do', async () => {
    const t = await installed();
    const anu = await memberSession(t.d, { appIds: ['immich'] });
    expect((await anu.mutate('apps.reinstall', { appId: 'immich' })).error?.data.hlabsCode).toBe('ACCESS_DENIED');
    expect((await anu.query('apps.get', { appId: 'immich' })).result!.data.reinstall).toBeNull();
    const admin = (await t.d.query('apps.get', { appId: 'immich' })) as Reply;
    expect(admin.result!.data.reinstall).toMatchObject({ version: expect.any(String), blocked: null });
  });
});
