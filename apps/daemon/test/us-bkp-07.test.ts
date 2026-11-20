// US-BKP-07 · Handle failed runs (server side): a destination that doesn't answer is tried twice more, 5 s apart; a
// failed scheduled run is tried once more 30 minutes later; the run keeps the code and the log says when it's tried
// next; admins get a warning, a critical one after three failures in a row.
import { backupRuns, getSetting, notifications } from '@hlabs/db';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { backupsDaemon } from './backups-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type T = Awaited<ReturnType<typeof backupsDaemon>>;
const backUp = async (t: T) => t.s.jobs.settled(t.data<{ jobId: string }>(await t.d.mutate('backups.runNow')).jobId);

describe('US-BKP-07', () => {
  it('no answer: tried twice more, 5 s apart, then BACKUP_DEST_UNREACHABLE', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    const nas = await t.nasDestination();
    const waits: number[] = [];
    t.s.backups.sleep = async (ms) => void waits.push(ms);
    t.restic.unreachable.add(nas.repo);
    expect((await backUp(t))?.state).toBe('failed');
    expect(waits).toEqual([5_000, 5_000]);
    const run = t.db.select().from(backupRuns).get()!;
    expect(run).toMatchObject({ status: 'failed', error: 'BACKUP_DEST_UNREACHABLE' });
    const log = readFileSync(run.logPath!, 'utf8');
    expect(log).toContain('Retrying (1/2): host did not respond');
    expect(log).toContain('Retrying (2/2): host did not respond');
    expect(log).toMatch(/Backup stopped\. Next attempt: (today|tomorrow|\d+ \w+) at 03:00/);
    // One that came back on the second try succeeds.
    t.restic.unreachable.clear();
    t.restic.failNext('probe', 'BACKUP_DEST_UNREACHABLE');
    expect((await backUp(t))?.state).toBe('succeeded');
  });

  it('a failed scheduled run is tried again 30 minutes later, once; then the next scheduled time', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    await t.nasDestination();
    t.s.backups.sleep = async () => {};
    const at = (h: number, m = 0, d = 20) => new Date(2026, 10, d, h, m).getTime();
    t.s.backups.tick(at(2));
    t.restic.failNext('backup', 'BACKUP_DEST_FULL', 2);
    t.s.backups.tick(at(3, 1));
    await t.s.jobs.settled(t.s.jobs.listActive()[0]!.id);
    const retryAt = getSetting(t.db, 'backupSchedule').retryAt!;
    expect(retryAt).toBeGreaterThan(Date.now() + 29 * 60_000);
    expect(readFileSync(t.db.select().from(backupRuns).get()!.logPath!, 'utf8')).toMatch(
      /Next attempt: (today|tomorrow) at \d\d:\d\d/, // Worded from the real clock: tomorrow after 23:30.
    );
    t.s.backups.tick(retryAt - 1);
    expect(t.s.jobs.listActive()).toEqual([]);
    t.s.backups.tick(retryAt);
    await t.s.jobs.settled(t.s.jobs.listActive()[0]!.id);
    const runs = t.db.select().from(backupRuns).all();
    expect(runs.map((r) => [r.status, r.retry])).toEqual([
      ['failed', false],
      ['failed', true],
    ]);
    expect(getSetting(t.db, 'backupSchedule').retryAt).toBeNull();
    // The next scheduled 03:00 from the real clock: today when this runs before 3am.
    expect(readFileSync(runs[1]!.logPath!, 'utf8')).toMatch(/Next attempt: (today|tomorrow|\d+ \w+) at 03:00/);
  });

  it('admins get a warning with Details; three failures in a row make it critical', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    await t.nasDestination();
    t.s.backups.sleep = async () => {};
    for (let i = 0; i < 3; i++) {
      t.restic.failNext('backup', 'BACKUP_DEST_FULL');
      await backUp(t);
    }
    const list = t.db
      .select()
      .from(notifications)
      .all()
      .filter((n) => n.kind === 'backup.failed');
    expect(list.map((n) => n.severity)).toEqual(['warning', 'warning', 'critical']);
    expect(list[0]).toMatchObject({ userId: null, title: 'Backup to NAS failed' });
    expect(list[0]!.body).toContain('NAS is full.');
  });
});
