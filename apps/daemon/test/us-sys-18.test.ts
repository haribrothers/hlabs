// US-SYS-18 · Restart the container engine (server side, with a fake engine and engine control).
import { auditLog } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { registerEngineRestart } from '../src/engine/restart-job';
import { daemonWithAdmin } from './admin-session';
import { FakeEngineControl } from './fakes/engine-control';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function withControl() {
  const control = new FakeEngineControl();
  const d = await daemonWithAdmin(closers, {}, { engineControl: control });
  return { ...d, control };
}

describe('US-SYS-18', () => {
  it('restarts the engine as a job, waits for it to answer, and audits it', async () => {
    const d = await withControl();
    const { jobId } = (await d.mutate('settings.engine.restart')).result!.data as { jobId: string };
    const job = await d.services!.jobs.settled(jobId);
    expect(job).toMatchObject({ kind: 'engine_restart', state: 'succeeded', progress: 100 });
    expect(d.control.restarts.map((c) => c.kind)).toEqual(['orbstack']);
    expect(d.services!.db.select().from(auditLog).where(eq(auditLog.action, 'engine.restart')).all()).toHaveLength(1);
  });

  it('a second restart while one runs gets the same job', async () => {
    const d = await withControl();
    let release = () => {};
    d.control.onRestart = () => new Promise<void>((r) => (release = r));
    const first = (await d.mutate('settings.engine.restart')).result!.data as { jobId: string };
    const second = (await d.mutate('settings.engine.restart')).result!.data as { jobId: string };
    expect(second.jobId).toBe(first.jobId);
    release();
    await d.services!.jobs.settled(first.jobId);
  });

  it("fails when the engine isn't back in time; the engine then shows stopped", async () => {
    const d = await withControl();
    const s = d.services!;
    registerEngineRestart({
      jobs: s.jobs,
      engine: s.engine,
      control: d.control,
      db: s.db,
      backWithinMs: 50,
      pollMs: 10,
    });
    d.control.onRestart = () => {
      d.engine.running = false;
    };
    const { jobId } = (await d.mutate('settings.engine.restart')).result!.data as { jobId: string };
    expect(await s.jobs.settled(jobId)).toMatchObject({ state: 'failed', hlabsCode: 'ENGINE_START_FAILED' });
    expect(((await d.query('settings.engine.get')).result!.data as { status: string }).status).toBe('stopped');
  });
});
