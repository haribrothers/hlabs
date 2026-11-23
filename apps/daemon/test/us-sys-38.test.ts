// US-SYS-38 · Reset hlabs (server side): once confirmed, the exclusive factory_reset job runs and every session ends
// at once; it takes every app down with its volumes, deletes app data, Shared, the trash and (unless kept) Home
// folders, removes hlabs's secrets (never the tray's token) and leaves backup repositories alone; the audit entry is
// also written to a file in the data dir; hlabs starts again with an empty database, in onboarding, reusing the setup
// token the browser was given. A failure midway is noted, the rest still goes, and the next admin is told.
import { appEnv, auditLog, backupDestinations, getSetting, notifications, sessions, users } from '@hlabs/db';
import { isNull } from 'drizzle-orm';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { shutdown } from '../src/boot';
import { SETUP_TOKEN_REF } from '../src/onboarding/service';
import { FileSecretStore } from '../src/platform/secrets';
import { RESET_INCOMPLETE_KIND, RESET_LOG, RESET_MARKER, safeToDelete } from '../src/system/factory-reset';
import type { Reply } from './admin-session';
import { tempDir } from './helpers';
import { installDaemon } from './install-harness';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const until = async (check: () => boolean) => {
  for (let i = 0; i < 300 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
};

async function setup() {
  let restarts = 0;
  const t = await installDaemon(closers, { restartDaemon: () => void restarts++ });
  t.s.appWatch.stop();
  const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
  await t.s.jobs.settled(res.result!.data.jobId as string);
  const { dataDir, appDataDir } = t.d.config.paths;
  for (const [path, text] of [
    ['users/hari/Photos/a.jpg', 'photo'],
    ['shared/Media/film.mkv', 'film'],
    ['.trash/hari/old.txt', 'old'],
  ] as const) {
    mkdirSync(join(t.root, path, '..'), { recursive: true });
    writeFileSync(join(t.root, path), text);
  }
  // A backup repository on a drive: never touched.
  const repo = join(tempDir('repo-'), 'hlabs-backups');
  mkdirSync(repo, { recursive: true });
  writeFileSync(join(repo, 'config'), 'restic');
  t.s.db
    .insert(backupDestinations)
    .values({
      id: 'usb',
      kind: 'local',
      name: 'USB disk',
      configJson: { type: 'external', drivePath: repo, driveName: 'USB', folder: '' },
      repoPasswordRef: 'backup:usb:password',
      createdAt: 1,
    })
    .run();
  await t.s.secrets.set('backup:usb:password', 'repo-pass');
  await t.s.secrets.set('tray-token', 'the tray keeps this');
  const anu = await memberSession(t.d);
  const reset = async (keepHomeFolders = false) => {
    const reply = (await t.d.mutate('system.factoryReset', {
      password: 'correct horse battery',
      confirmHostname: 'hlabs',
      keepHomeFolders,
    })) as Reply;
    expect(reply.error).toBeUndefined();
    return reply.result!.data as { jobId: string; setupToken: string };
  };
  /** As launchd or systemd would: hlabsd stops and starts again. */
  const startAgain = async () => {
    await until(() => restarts === 1);
    expect(restarts).toBe(1);
    await shutdown(t.d.holder.current);
    const again = (await t.d.boot())!;
    t.d.holder.set(again);
    return again;
  };
  return { ...t, dataDir, appDataDir, repo, anu, reset, startAgain };
}

describe('US-SYS-38', () => {
  it('deletes everything but backups, ends every session at once, and starts again in onboarding', async () => {
    const t = await setup();
    const db = t.s.db;
    const { jobId, setupToken } = await t.reset();
    expect(setupToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Every session ended at once.
    expect(db.select().from(sessions).where(isNull(sessions.revokedAt)).all()).toEqual([]);
    const health = (await (await fetch(`${t.d.url}/healthz`)).json()) as { reason: string; steps: number };
    expect(health).toMatchObject({ reason: 'resetting', steps: 4 });
    // Audited before anything was deleted.
    expect(
      db
        .select()
        .from(auditLog)
        .all()
        .find((a) => a.action === 'system.factory_reset'),
    ).toMatchObject({
      userId: t.d.userId,
      detailJson: { keepHomeFolders: false },
    });
    const job = await t.s.jobs.settled(jobId);
    expect(job).toMatchObject({ kind: 'factory_reset', state: 'succeeded' });

    expect(t.compose.calls).toContainEqual({ op: 'down', project: 'hlabs-uptime-kuma' });
    expect(t.compose.downOptions.at(-1)).toEqual({ removeVolumes: true });
    for (const gone of [
      t.appDataDir,
      join(t.root, 'shared'),
      join(t.root, '.trash'),
      join(t.root, 'users'),
      join(t.dataDir, 'apps'),
    ]) {
      expect(existsSync(gone), gone).toBe(false);
    }
    expect(readFileSync(join(t.repo, 'config'), 'utf8')).toBe('restic');
    const store = new FileSecretStore(t.dataDir);
    expect(await store.get('backup:usb:password')).toBeNull();
    expect(await store.get('tray-token')).toBe('the tray keeps this');
    expect(await store.get(SETUP_TOKEN_REF)).toBe(setupToken);
    expect(readFileSync(join(t.dataDir, ...RESET_LOG), 'utf8')).toContain('"action":"system.factory_reset"');
    expect(existsSync(join(t.dataDir, RESET_MARKER))).toBe(true);

    const again = await t.startAgain();
    expect(existsSync(join(t.dataDir, RESET_MARKER))).toBe(false);
    expect(again.db.select().from(users).all()).toEqual([]);
    expect(again.db.select().from(appEnv).all()).toEqual([]);
    expect(again.onboarding.status()).toMatchObject({ completed: false, hasUsers: false });
    expect(again.onboarding.verifySetupToken(setupToken)).toBe(true);
    expect(getSetting(again.db, 'hostname')).toBe('hlabs');
    // The reset's own entry outlives the table.
    expect(again.db.select().from(auditLog).all()).toEqual([]);
    expect(readFileSync(join(t.dataDir, ...RESET_LOG), 'utf8')).toContain(t.d.userId);
  });

  it("keeps everyone's Home folders when asked", async () => {
    const t = await setup();
    const { jobId } = await t.reset(true);
    await t.s.jobs.settled(jobId);
    expect(readFileSync(join(t.root, 'users/hari/Photos/a.jpg'), 'utf8')).toBe('photo');
    expect(existsSync(join(t.root, 'shared'))).toBe(false);
  });

  it('carries on past a failure, says what was left, and still ends in onboarding', async () => {
    const t = await setup();
    t.compose.fail('down', 'hlabs-uptime-kuma');
    const { jobId } = await t.reset();
    expect(await t.s.jobs.settled(jobId)).toMatchObject({ state: 'succeeded' });
    expect(existsSync(join(t.root, 'shared'))).toBe(false);
    const again = await t.startAgain();
    expect(again.onboarding.status().completed).toBe(false);
    expect(again.db.select().from(notifications).all()).toEqual([
      expect.objectContaining({ kind: RESET_INCOMPLETE_KIND, userId: null, body: 'Left behind: app uptime-kuma.' }),
    ]);
  });

  it('only deletes folders inside the ones it was given, never a home or a top-level folder', () => {
    expect(safeToDelete('/Users/hari/hlabs/shared', ['/Users/hari/hlabs'])).toBe(true);
    expect(safeToDelete('/Users/hari/hlabs/../Documents', ['/Users/hari/hlabs'])).toBe(false);
    expect(safeToDelete('/Users', ['/'])).toBe(false);
    expect(safeToDelete('relative/path', ['relative'])).toBe(false);
    expect(safeToDelete('/srv/elsewhere', ['/srv/hlabs'])).toBe(false);
  });
});
