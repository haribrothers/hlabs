// US-BKP-20 · Watch a restore in progress (server side): Stop → Safety copy → Copy → Start (D-024), each step with
// its times, the copy with bytes; staging and the safety copy sit beside the data; getRestore and the overview show
// it while it runs.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { backupsDaemon } from './backups-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type View = {
  status: string;
  cancellable: boolean;
  steps: Array<{
    kind: string;
    appId: string | null;
    state: string;
    startedAt: number | null;
    finishedAt: number | null;
    bytesDone: number | null;
    bytesTotal: number | null;
  }>;
};

describe('US-BKP-20', () => {
  it('replacing one app: stop, safety copy, copy (with bytes), start; the app gets yesterday’s data', async () => {
    const t = await backupsDaemon(closers);
    const { data } = t.app('vaultwarden', { name: 'Vaultwarden' });
    const nas = await t.nasDestination();
    const point = await t.backUp();
    writeFileSync(join(data, 'db', 'data.sqlite'), 'today');
    let release!: () => void;
    t.restic.gate = new Promise<void>((r) => (release = r));
    const seen = new Promise<void>((r) => (t.restic.onGate = r));
    const { jobId } = t.data<{ jobId: string }>(
      await t.d.mutate('backups.restore', {
        destinationId: nas.destinationId,
        snapshotId: point,
        scope: { mode: 'replace', apps: ['vaultwarden'], folders: [] },
        password: 'correct horse battery',
      }),
    );
    await seen;
    const mid = t.data<View>(await t.d.query('backups.getRestore', { jobId }));
    expect(mid.steps.map((s) => [s.kind, s.state])).toEqual([
      ['stop', 'done'],
      ['safety', 'done'],
      ['copy', 'running'],
      ['start', 'todo'],
    ]);
    expect(mid.steps[2]!.bytesTotal).toBeGreaterThan(0);
    expect(mid.cancellable).toBe(true);
    // Staging and the safety copy beside the app's data.
    expect(readdirSync(join(t.s.config.paths.appDataDir, '.restore'))).toHaveLength(1);
    const overview = t.data<{ restoring: { jobId: string } | null }>(await t.d.query('backups.overview'));
    expect(overview.restoring?.jobId).toBe(jobId);
    release();
    t.restic.gate = null;
    expect((await t.s.jobs.settled(jobId))?.state).toBe('succeeded');
    const end = t.data<View>(await t.d.query('backups.getRestore', { jobId }));
    expect(end.status).toBe('succeeded');
    expect(end.steps.every((s) => s.state === 'done' && s.finishedAt! >= s.startedAt!)).toBe(true);
    expect(t.appControl.calls).toEqual(['stop:vaultwarden', 'start:vaultwarden']);
    expect(readFileSync(join(data, 'db', 'data.sqlite'), 'utf8')).toBe('vaultwarden data');
    // The safety copy and staging are gone.
    expect(readdirSync(t.s.config.paths.appDataDir)).not.toContain('.restore.tmp');
    expect(readdirSync(join(t.s.config.paths.appDataDir, '.restore'))).toEqual([]);
  });
});
