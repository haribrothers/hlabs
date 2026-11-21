// US-BKP-05 · Run a backup (server side): per destination a run row; pre-hooks, then pausing, apps always resumed;
// each app and folder tagged; the system part (database copy, app setup, sealed secrets); counts on success; a crash
// mid-run settled on the next start; a run missed while asleep started once.
import { backupRuns, getSetting, setSetting } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { createDecipheriv, scryptSync } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { backupsDaemon, PASSWORD } from './backups-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type T = Awaited<ReturnType<typeof backupsDaemon>>;

async function backUp(t: T) {
  const { jobId } = t.data<{ jobId: string }>(await t.d.mutate('backups.runNow'));
  return t.s.jobs.settled(jobId);
}

describe('US-BKP-05', () => {
  it('a run row per destination; each app and Home folder copied with its tags, then the system part', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden', { name: 'Vaultwarden' });
    t.put('users/hari/Documents/tax.pdf');
    t.put('shared/Recipes/soup.txt');
    const a = await t.nasDestination('NAS');
    const b = await t.nasDestination('Office');
    const job = await backUp(t);
    expect(job?.state).toBe('succeeded');
    const runs = t.db.select().from(backupRuns).all();
    expect(runs.map((r) => [r.destinationId, r.status, r.trigger, r.appCount])).toEqual([
      [a.destinationId, 'succeeded', 'manual', 1],
      [b.destinationId, 'succeeded', 'manual', 1],
    ]);
    const backups = t.restic.calls.filter((c) => c.op === 'backup' && c.url === a.repo);
    const tags = backups.map((c) => (c.detail as { tags: string[] }).tags[0]);
    expect(tags).toEqual(['app:vaultwarden', 'folder:users/anu', 'folder:users/hari', 'folder:shared', 'system']);
    for (const c of backups) expect((c.detail as { tags: string[] }).tags).toContain(`run:${runs[0]!.id}`);
    expect(runs[0]!.bytesAdded).toBeGreaterThan(0);
    expect(runs[0]!.finishedAt).not.toBeNull();
  });

  it('pre-hooks run first, then the app pauses; it’s resumed after its copy, and always after a failure', async () => {
    const t = await backupsDaemon(closers);
    t.app('paperless', {
      name: 'Paperless',
      services: ['server', 'database'],
      backup: { pause: ['server'], preHook: { service: 'database', command: 'pg_dumpall > /backup/dump.sql' } },
    });
    await t.nasDestination();
    expect((await backUp(t))?.state).toBe('succeeded');
    expect(t.engine.execs).toEqual([{ id: 'paperless-database-1', command: 'pg_dumpall > /backup/dump.sql' }]);
    expect(t.engine.pauses).toEqual([
      { id: 'paperless-server-0', paused: true },
      { id: 'paperless-server-0', paused: false },
    ]);

    t.engine.pauses.length = 0;
    t.restic.failNext('backup', 'BACKUP_DEST_FULL');
    expect((await backUp(t))?.state).toBe('failed');
    expect(t.engine.pauses.at(-1)).toEqual({ id: 'paperless-server-0', paused: false });
    const log = readFileSync(t.db.select().from(backupRuns).all().at(-1)!.logPath!, 'utf8');
    // Named as the store names it (here the app has no catalog entry, so its id).
    expect(log).toContain('Resuming apps: paperless');
    expect(log).toMatch(/^\d\d:\d\d:\d\d /m);
  });

  it('a pre-hook that fails stops the run with BACKUP_PREHOOK_FAILED; an app in error is copied without hook or pause', async () => {
    const t = await backupsDaemon(closers);
    t.app('paperless', { backup: { pause: ['server'], preHook: { service: 'server', command: 'dump' } } });
    await t.nasDestination();
    t.engine.execResults.set('dump', { exitCode: 2, output: 'nope' });
    expect((await backUp(t))?.state).toBe('failed');
    expect(t.db.select().from(backupRuns).get()?.error).toBe('BACKUP_PREHOOK_FAILED');

    const u = await backupsDaemon(closers);
    u.app('broken', { state: 'error', backup: { pause: ['server'], preHook: { service: 'server', command: 'dump' } } });
    await u.nasDestination();
    expect((await backUp(u))?.state).toBe('succeeded');
    expect(u.engine.execs).toEqual([]);
    expect(u.engine.pauses).toEqual([]);
    expect(
      u.restic.calls.some((c) => c.op === 'backup' && (c.detail as { tags: string[] }).tags[0] === 'app:broken'),
    ).toBe(true);
  });

  it('the system part holds a copy of hlabs.db, the app setup and the secrets sealed with the destination’s password', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    const nas = await t.nasDestination();
    await backUp(t);
    const repo = t.restic.repos.get(nas.repo)!;
    const system = repo.snapshots.find((s) => s.tags.includes('system'))!;
    const stored = readdirSync(system.dir).map(decodeURIComponent);
    expect(stored).toEqual(expect.arrayContaining([join(t.s.config.paths.dataDir, 'apps')]));
    const staging = stored.find((p) => p.includes('/.backup/'))!;
    const files = readdirSync(join(system.dir, encodeURIComponent(staging)));
    expect(files.sort()).toEqual(['hlabs.db', 'secrets.bundle']);
    const bundle = JSON.parse(
      readFileSync(join(system.dir, encodeURIComponent(staging), 'secrets.bundle'), 'utf8'),
    ) as Record<string, string>;
    expect(JSON.stringify(bundle)).not.toContain(PASSWORD);
    const key = scryptSync(PASSWORD, Buffer.from(bundle.salt!, 'base64'), 32, {
      N: 2 ** 15,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(bundle.iv!, 'base64'));
    d.setAuthTag(Buffer.from(bundle.tag!, 'base64'));
    const secrets = JSON.parse(
      Buffer.concat([d.update(Buffer.from(bundle.data!, 'base64')), d.final()]).toString('utf8'),
    );
    expect(secrets[`backup:${nas.destinationId}:password`]).toBe(PASSWORD);
    // The staging folder is gone afterwards.
    expect(readdirSync(t.s.config.paths.dataDir)).not.toContain('.backup');
  });

  it('no password or key ever reaches the run log', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    await t.nasDestination();
    await backUp(t);
    const log = readFileSync(t.db.select().from(backupRuns).get()!.logPath!, 'utf8');
    expect(log).not.toContain(PASSWORD);
    expect(log).toContain('Copying hlabs settings, users and app setup');
  });

  it('after a crash: the run is failed with BACKUP_INTERRUPTED, paused apps resumed, the lock removed', async () => {
    const t = await backupsDaemon(closers);
    t.app('paperless', { backup: { pause: ['server'] } });
    const nas = await t.nasDestination();
    t.db
      .insert(backupRuns)
      .values({ id: 'run1', destinationId: nas.destinationId, startedAt: 1, status: 'running', trigger: 'schedule' })
      .run();
    t.engine.containers.get(t.s.apps.project('paperless').name)![0]!.state = 'paused';
    await t.s.backups.recover();
    expect(t.db.select().from(backupRuns).where(eq(backupRuns.id, 'run1')).get()).toMatchObject({
      status: 'failed',
      error: 'BACKUP_INTERRUPTED',
    });
    expect(t.engine.pauses).toEqual([{ id: 'paperless-server-0', paused: false }]);
    expect(t.restic.calls.filter((c) => c.op === 'unlock').map((c) => c.url)).toEqual([nas.repo]);
  });

  it('the schedule: nothing at first, then the next time it fires; one missed while asleep runs once', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    await t.nasDestination();
    const day = (h: number, m = 0, d = 20) => new Date(2026, 10, d, h, m).getTime();
    t.s.backups.tick(day(10));
    expect(t.s.jobs.listActive()).toEqual([]);
    expect(getSetting(t.db, 'backupSchedule').lastSlot).toBe(day(3));
    t.s.backups.tick(day(23, 59));
    expect(t.s.jobs.listActive()).toEqual([]);
    // Asleep through 03:00 on the 21st and the 22nd; awake at 07:10 on the 22nd: one run.
    t.s.backups.tick(day(7, 10, 22));
    const [job] = t.s.jobs.listActive();
    expect(job?.kind).toBe('backup');
    await t.s.jobs.settled(job!.id);
    t.s.backups.tick(day(7, 11, 22));
    expect(t.s.jobs.listActive()).toEqual([]);
    expect(
      t.db
        .select()
        .from(backupRuns)
        .all()
        .map((r) => r.trigger),
    ).toEqual(['schedule']);
    expect(getSetting(t.db, 'backupSchedule').lastSlot).toBe(day(3, 0, 22));
  });

  it('scheduled backups off, or no destination: nothing runs', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    const day = (h: number, d = 20) => new Date(2026, 10, d, h).getTime();
    t.s.backups.tick(day(10));
    t.s.backups.tick(day(10, 21));
    expect(t.s.jobs.listActive()).toEqual([]);
    await t.nasDestination();
    t.data(await t.d.mutate('backups.plan.update', { enabled: false }));
    t.s.backups.tick(day(10, 22));
    expect(t.s.jobs.listActive()).toEqual([]);
    setSetting(t.db, 'backupSchedule', { lastSlot: null, retryAt: null });
  });
});
