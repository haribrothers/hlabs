// US-APP-12 · Uninstall runs and cleans up: the app goes to uninstalling at once; the job stops it, takes away its
// route and name, removes it from every Home, Dock, share and backup plan, then keeps or deletes its data (a kept
// .env means a reinstall gets the same passwords). A failed step leaves it in error with a way to try again.
import { appAccess, apps, auditLog, backupPlan, homeLayout, notifications, users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENV_FILE } from '../src/apps/compose';
import { parseEnvFile } from '../src/apps/env';
import type { NoopProxyManager } from '../src/caddy/index';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = {
  result?: { data: Record<string, unknown> };
  error?: { data: { hlabsCode: string } };
};

const IMMICH = {
  appId: 'immich',
  mounts: [{ target: 'library', storageLocationId: 'root', subpath: 'users/hari/Photos', mode: 'rw' }],
};

async function installed() {
  const t = await installDaemon(closers);
  const res = (await t.d.mutate('apps.install', IMMICH)) as Reply;
  await t.s.jobs.settled(res.result!.data.jobId as string);
  const project = t.s.apps.project('immich');
  const dataDir = join(t.s.config.paths.appDataDir, 'immich');
  const secret = () => parseEnvFile(readFileSync(join(project.dir, ENV_FILE), 'utf8')).DB_PASSWORD;
  const events: Array<{ state: string; detail: string | null }> = [];
  t.s.bus.on(({ event }) => {
    if (event.type === 'app.stateChanged') events.push({ state: event.data.state, detail: event.data.detail });
  });
  const uninstall = async (keepData: boolean) => {
    const r = (await t.d.mutate('apps.uninstall', { appId: 'immich', keepData })) as Reply;
    return r;
  };
  return { ...t, project, dataDir, secret, events, uninstall };
}

describe('US-APP-12', () => {
  it('keeping the data: everything else goes, and a reinstall gets the same data and passwords', async () => {
    const t = await installed();
    // A member it's shared with, on whose Home and Dock it is; the backup plan names it.
    const member = ulid();
    t.s.db
      .insert(users)
      .values({ id: member, username: 'anu', displayName: 'Anu', role: 'member', passwordHash: 'x', createdAt: 1 })
      .run();
    t.s.db.insert(appAccess).values({ appId: 'immich', userId: member }).run();
    t.s.db
      .insert(homeLayout)
      .values({
        userId: member,
        itemsJson: [
          { kind: 'app', id: 'immich' },
          { kind: 'widget', id: 'usage' },
        ],
        dockJson: ['immich'],
      })
      .run();
    t.s.db
      .insert(backupPlan)
      .values({ id: 1, includeJson: { apps: ['immich'], homeFolders: 'all' } })
      .run();
    const before = t.secret();

    const res = await t.uninstall(true);
    await t.s.jobs.settled(res.result!.data.jobId as string);
    // Home showed it uninstalling from the start.
    expect(t.events[0]).toMatchObject({ state: 'uninstalling' });

    expect(t.s.db.select().from(apps).all()).toEqual([]);
    expect([...t.engine.containers.values()].flat()).toEqual([]);
    expect((t.s.proxy as NoopProxyManager).last?.apps.map((a) => a.appId)).not.toContain('immich');
    expect(t.s.db.select().from(appAccess).all()).toEqual([]);
    expect(t.s.db.select().from(homeLayout).where(eq(homeLayout.userId, member)).get()).toMatchObject({
      itemsJson: [{ kind: 'widget', id: 'usage' }],
      dockJson: [],
    });
    expect(t.s.db.select().from(backupPlan).get()?.includeJson.apps).toEqual([]);
    expect(existsSync(t.dataDir)).toBe(true);
    expect(readdirSync(t.project.dir)).toEqual([ENV_FILE]);
    expect(t.events.at(-1)).toEqual({ state: 'uninstalling', detail: 'removed' });
    expect(t.s.db.select().from(auditLog).where(eq(auditLog.action, 'app.uninstall')).all()).toEqual([
      expect.objectContaining({ target: 'immich', detailJson: { keepData: true } }),
    ]);
    expect(t.s.db.select().from(notifications).where(eq(notifications.kind, 'app.uninstalled')).get()).toMatchObject({
      title: 'Immich was uninstalled',
      severity: 'success',
    });

    const again = (await t.d.mutate('apps.install', IMMICH)) as Reply;
    await t.s.jobs.settled(again.result!.data.jobId as string);
    expect(t.secret()).toBe(before);
  });

  it('deleting the data too removes its data folder and project', async () => {
    const t = await installed();
    const res = await t.uninstall(false);
    await t.s.jobs.settled(res.result!.data.jobId as string);
    expect(existsSync(t.dataDir)).toBe(false);
    expect(existsSync(t.project.dir)).toBe(false);
    expect(t.s.db.select().from(auditLog).where(eq(auditLog.action, 'app.uninstall')).get()?.detailJson).toEqual({
      keepData: false,
    });
  });

  it('a step that fails leaves the app in error saying which, with a notification to try again', async () => {
    const t = await installed();
    t.compose.fail('down', t.project.name);
    const res = await t.uninstall(true);
    await t.s.jobs.settled(res.result!.data.jobId as string).catch(() => undefined);
    const app = t.s.db.select().from(apps).get()!;
    expect(app.state).toBe('error');
    expect(JSON.parse(app.stateDetail!)).toMatchObject({ step: 'stop', uninstall: true });
    expect(
      t.s.db.select().from(notifications).where(eq(notifications.kind, 'app.uninstall_failed')).get(),
    ).toMatchObject({
      title: "Immich couldn't be uninstalled",
      severity: 'critical',
      actionJson: [
        {
          kind: 'mutation',
          procedure: 'apps.uninstall',
          input: { appId: 'immich', keepData: true },
          label: 'Try again',
        },
      ],
    });
    // Trying again works.
    const retry = await t.uninstall(true);
    await t.s.jobs.settled(retry.result!.data.jobId as string);
    await vi.waitFor(() => expect(t.s.db.select().from(apps).all()).toEqual([]));
  });

  it('an app in the middle of something is refused with APP_BUSY', async () => {
    const t = await installed();
    t.s.apps.transition('immich', 'restarting');
    expect((await t.uninstall(true)).error?.data.hlabsCode).toBe('APP_BUSY');
    expect(t.s.db.select().from(apps).get()?.state).toBe('restarting');
  });
});
