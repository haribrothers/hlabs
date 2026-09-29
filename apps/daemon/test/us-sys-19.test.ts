// US-SYS-19 · Set resources given to apps (server side).
import { getSetting } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { resourceLimits, resourcesProblem } from '../src/engine/overview';
import { daemonWithAdmin } from './admin-session';
import { FakeEngineControl } from './fakes/engine-control';
import { FakeEngine, fakeMachine } from './fakes/engine';
import { FakeSystemProbe } from './fakes/system';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const GIB = 2 ** 30;
const COLIMA_SOCKET = '/fake/.colima/hlabs/docker.sock';

async function withColima() {
  const control = new FakeEngineControl();
  const system = new FakeSystemProbe(200 * GIB);
  const d = await daemonWithAdmin(
    closers,
    {},
    {
      engineControl: control,
      system,
      engine: {
        candidates: async () => [{ kind: 'colima', socketPath: COLIMA_SOCKET, managedByHlabs: true }],
        detect: fakeMachine({ [COLIMA_SOCKET]: new FakeEngine() }),
        retryMs: 60_000,
      },
    },
  );
  return { ...d, control };
}

describe('US-SYS-19', () => {
  it('limits: 1 to all cores; 2 GB to all memory but 2 GB; disk only grows, up to the free space', () => {
    const limits = resourceLimits({ cpus: 8, memoryBytes: 16 * GIB, freeDiskBytes: 50 * GIB }, 100 * GIB);
    expect(limits).toEqual({
      maxCpus: 8,
      minMemoryBytes: 2 * GIB,
      maxMemoryBytes: 14 * GIB,
      minDiskBytes: 100 * GIB,
      maxDiskBytes: 150 * GIB,
    });
    const ok = { cpus: 4, memoryBytes: 8 * GIB, diskBytes: 120 * GIB };
    expect(resourcesProblem(ok, limits)).toBeNull();
    expect(resourcesProblem({ ...ok, cpus: 9 }, limits)).toBe('cpus');
    expect(resourcesProblem({ ...ok, memoryBytes: GIB }, limits)).toBe('memory');
    expect(resourcesProblem({ ...ok, diskBytes: 90 * GIB }, limits)).toBe('disk');
  });

  it("hlabs's Colima: editable, starting from the install defaults", async () => {
    const d = await withColima();
    const data = (await d.query('settings.engine.get')).result!.data as { resources: Record<string, unknown> };
    expect(data.resources).toMatchObject({ editable: true, cpus: 4, memoryBytes: 8 * GIB, diskBytes: 100 * GIB });
  });

  it('applying restarts Colima with the new values and remembers them', async () => {
    const d = await withColima();
    const want = { cpus: 2, memoryBytes: 6 * GIB, diskBytes: 120 * GIB };
    const { jobId } = (await d.mutate('settings.engine.setResources', want)).result!.data as { jobId: string };
    expect(await d.services!.jobs.settled(jobId)).toMatchObject({ state: 'succeeded' });
    expect(d.control.applied).toEqual([want]);
    expect(getSetting(d.services!.db, 'engine').resources).toEqual(want);
  });

  it('out of range, or another engine, is refused', async () => {
    const d = await withColima();
    const r = await d.mutate('settings.engine.setResources', { cpus: 64, memoryBytes: 6 * GIB, diskBytes: 120 * GIB });
    expect(r.error?.data).toMatchObject({ hlabsCode: 'VALIDATION_FAILED', detail: { field: 'cpus' } });

    const other = await daemonWithAdmin(closers);
    const o = await other.mutate('settings.engine.setResources', {
      cpus: 2,
      memoryBytes: 6 * GIB,
      diskBytes: 120 * GIB,
    });
    expect(o.error?.data.hlabsCode).toBe('VALIDATION_FAILED');
    const readOnly = (await other.query('settings.engine.get')).result!.data as { resources: { editable: boolean } };
    expect(readOnly.resources.editable).toBe(false);
  });
});
