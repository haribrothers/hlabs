import { hlabsError, type HlabsEvent } from '@hlabs/api';
import { jobs as jobsTable, openDb } from '@hlabs/db';
import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/events/bus';
import { JobRunner } from '../src/jobs/runner';
import { silentLogger } from '../src/logger';
import { tempDir } from './helpers';

function setup() {
  const db = openDb({ dataDir: tempDir() });
  const bus = new EventBus();
  const events: HlabsEvent[] = [];
  bus.on((e) => events.push(e.event));
  const runner = new JobRunner(db, bus, silentLogger());
  return { db, bus, runner, events };
}

/** A job that waits until released. */
function gate() {
  let release!: () => void;
  const released = new Promise<void>((r) => (release = r));
  return { release, released };
}

describe('JobRunner', () => {
  it('persists progress, emits job.progress and job.finished', async () => {
    const { runner, events } = setup();
    runner.register<{ steps: number }>('noop', {
      async run({ report, payload }) {
        for (let i = 1; i <= payload.steps; i++) report((i / payload.steps) * 100, `step ${i}`);
      },
    });
    const id = runner.start('noop', { target: 'x', payload: { steps: 4 } });
    const job = await runner.settled(id);
    expect(job).toMatchObject({ id, kind: 'noop', target: 'x', state: 'succeeded', progress: 100, hlabsCode: null });
    expect(events.filter((e) => e.type === 'job.progress').map((e) => e.data.progress)).toEqual([25, 50, 75, 100]);
    expect(events.at(-1)).toMatchObject({ type: 'job.finished', data: { jobId: id, state: 'succeeded' } });
  });

  it('records the hlabsCode of a failed job', async () => {
    const { runner } = setup();
    runner.register('app_install', {
      async run() {
        throw hlabsError('APP_PORT_IN_USE');
      },
    });
    const id = runner.start('app_install', { target: 'jellyfin' });
    expect(await runner.settled(id)).toMatchObject({ state: 'failed', hlabsCode: 'APP_PORT_IN_USE' });
  });

  it('keeps exclusive jobs exclusive (D-020)', async () => {
    const { runner } = setup();
    const g = gate();
    runner.register('app_install', { run: () => g.released });
    runner.register('restore', { run: async () => {} });
    runner.register('system_update', { run: () => g.released });

    const install = runner.start('app_install', { target: 'immich' });
    expect(() => runner.start('restore')).toThrow(
      expect.objectContaining({ cause: expect.objectContaining({ hlabsCode: 'JOB_EXCLUSIVE_RUNNING' }) }),
    );
    g.release();
    await runner.settled(install);

    const g2 = gate();
    runner.register('system_update', { run: () => g2.released });
    const update = runner.start('system_update');
    expect(() => runner.start('app_install', { target: 'jellyfin' })).toThrow(/JOB_EXCLUSIVE_RUNNING/);
    g2.release();
    await runner.settled(update);
    expect(() => runner.start('restore')).not.toThrow();
  });

  it('cancels only cancellable jobs', async () => {
    const { runner } = setup();
    runner.register('backup', {
      cancellable: true,
      run: ({ signal }) => new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve())),
    });
    const g = gate();
    runner.register('app_update', { run: () => g.released });

    const backup = runner.start('backup');
    runner.cancel(backup);
    expect(await runner.settled(backup)).toMatchObject({ state: 'cancelled' });

    const update = runner.start('app_update', { target: 'immich' });
    expect(() => runner.cancel(update)).toThrow(/JOB_NOT_CANCELLABLE/);
    g.release();
    await runner.settled(update);
  });

  it('fails jobs left running by a crash on the next start', () => {
    const { db, runner } = setup();
    db.insert(jobsTable).values({ id: 'j1', kind: 'app_install', state: 'running', createdAt: 1 }).run();
    db.insert(jobsTable).values({ id: 'j2', kind: 'backup', state: 'succeeded', createdAt: 1 }).run();
    expect(runner.recover()).toBe(1);
    expect(runner.get('j1')).toMatchObject({ state: 'failed', hlabsCode: 'INTERNAL' });
    expect(runner.get('j2')).toMatchObject({ state: 'succeeded' });
    expect(runner.listActive()).toEqual([]);
  });

  it('refuses kinds without a handler', () => {
    const { runner } = setup();
    expect(() => runner.start('factory_reset')).toThrow(/NOT_IMPLEMENTED|No job handler/);
  });
});
