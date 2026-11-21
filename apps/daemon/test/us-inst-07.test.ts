// US-INST-07 · Back up now from the menu (daemon side): tray.status says whether a destination exists, when the last
// good run finished, whether a backup is running and how far it got, and whether the last run failed; the quick action
// starts the same run as Backups' "Back up now"; with no destination it's NOT_FOUND (the tray opens the backups setup);
// during a restore it's JOB_EXCLUSIVE_RUNNING (the tray says "Busy, try later").
import { hlabsCodeOf } from '@hlabs/api';
import { backupRuns, jobs } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { newTrayToken, TrayTokens } from '../src/auth/tray-token';
import type { DaemonContext } from '../src/context';
import { tray } from '../src/routers/tray';
import { trayStatus } from '../src/tray/status';
import { backupsDaemon } from './backups-fixture';
import { startDaemon } from './helpers';

const TOKEN = newTrayToken();
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-INST-07 · Back up now from the menu', () => {
  it('tray.quickAction backupNow with no destination is NOT_FOUND', async () => {
    const d = await startDaemon({ trayTokens: new TrayTokens({ read: async () => TOKEN }) });
    closers.push(d.close);
    const res = await fetch(`${d.url}/trpc/tray.quickAction`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'backupNow' }),
    });
    const body = (await res.json()) as { error?: { data: { hlabsCode: string } } };
    expect(body.error?.data.hlabsCode).toBe('NOT_FOUND');
  });

  it('tray.status: not configured, then never backed up, then running with progress, then the last good run', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    expect((await trayStatus(t.s)).backup).toEqual({
      configured: false,
      lastSucceededAt: null,
      running: false,
      progress: null,
      lastFailed: false,
    });
    await t.nasDestination();
    expect((await trayStatus(t.s)).backup).toMatchObject({ configured: true, lastSucceededAt: null, running: false });

    let release!: () => void;
    t.restic.gate = new Promise<void>((r) => (release = r));
    const { jobId } = await t.s.backups.runNow();
    const running = (await trayStatus(t.s)).backup;
    expect(running.running).toBe(true);
    expect(running.progress).toBeGreaterThanOrEqual(0);
    expect(running.progress).toBeLessThanOrEqual(1);
    release();
    t.restic.gate = null;
    await t.s.jobs.settled(jobId);
    const done = (await trayStatus(t.s)).backup;
    expect(done).toMatchObject({ running: false, progress: null, lastFailed: false });
    const run = t.db.select().from(backupRuns).get();
    expect(run?.trigger).toBe('manual');
    expect(done.lastSucceededAt).toBe(run?.finishedAt);
  });

  it('tray.status: a failed last run is lastFailed, until the next run starts', async () => {
    const t = await backupsDaemon(closers);
    await t.nasDestination();
    const now = Date.now();
    t.db
      .insert(backupRuns)
      .values([
        {
          id: ulid(),
          destinationId: null,
          startedAt: now - 7_200_000,
          finishedAt: now - 7_100_000,
          status: 'succeeded',
          trigger: 'schedule',
        },
        {
          id: ulid(),
          destinationId: null,
          startedAt: now - 60_000,
          finishedAt: now - 30_000,
          status: 'failed',
          trigger: 'manual',
          error: 'BACKUP_DEST_UNREACHABLE',
        },
      ])
      .run();
    expect((await trayStatus(t.s)).backup).toMatchObject({
      lastFailed: true,
      running: false,
      lastSucceededAt: now - 7_100_000,
    });
    t.db.insert(jobs).values({ id: ulid(), kind: 'backup', state: 'running', progress: 34, createdAt: now }).run();
    expect((await trayStatus(t.s)).backup).toMatchObject({ lastFailed: false, running: true, progress: 0.34 });
  });

  it('the quick action starts the same manual run; during a restore it is JOB_EXCLUSIVE_RUNNING', async () => {
    const t = await backupsDaemon(closers);
    t.app('vaultwarden');
    await t.nasDestination();
    // The tray router as the tray token reaches it.
    const ctx = { services: t.s } as unknown as DaemonContext;
    const handler = tray!.quickAction as unknown as (
      input: { action: 'backupNow' },
      ctx: DaemonContext,
    ) => { jobId: string };
    const quick = () => handler({ action: 'backupNow' }, ctx);
    const { jobId } = quick();
    expect(t.s.jobs.get(jobId)?.kind).toBe('backup');
    await t.s.jobs.settled(jobId);
    expect(t.db.select().from(backupRuns).get()?.trigger).toBe('manual');
    t.db
      .insert(jobs)
      .values({ id: ulid(), kind: 'restore', state: 'running', progress: 0, createdAt: Date.now() })
      .run();
    let code: string | null = null;
    try {
      quick();
    } catch (err) {
      code = hlabsCodeOf(err);
    }
    expect(code).toBe('JOB_EXCLUSIVE_RUNNING');
  });
});
