// The engine_start job (US-STATE-09): start the stopped engine with its own command (OrbStack and Docker Desktop are
// opened, Colima is started, Docker Engine on Linux through hlabs-priv), wait up to 120 s for it to answer (the same
// as setup, US-INST-12), then bring back the apps set to start automatically.
import { hlabsError } from '@hlabs/api';
import { auditLog, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import type { JobRunner } from '../jobs/runner';
import type { EngineControl } from './control';
import type { EngineService } from './service';

export const ENGINE_START_MS = 120_000;

export function registerEngineStart(deps: {
  jobs: JobRunner;
  engine: Pick<EngineService, 'status' | 'lastCandidate' | 'check'>;
  control: EngineControl;
  db: HlabsDb;
  /** Reconciles the apps once the engine answers. */
  appsBack: () => Promise<void>;
  startWithinMs?: number;
  pollMs?: number;
}): void {
  deps.jobs.register<{ userId: string | null }>('engine_start', {
    async run({ payload, signal, report }) {
      const status = deps.engine.status;
      const candidate = status.state === 'missing' ? deps.engine.lastCandidate : status.candidate;
      if (!candidate) throw hlabsError('ENGINE_UNAVAILABLE', 'No engine to start');
      deps.db
        .insert(auditLog)
        .values({
          id: ulid(),
          at: Date.now(),
          userId: payload.userId,
          action: 'engine.start',
          target: candidate.kind,
          detailJson: null,
          ip: null,
        })
        .run();
      if (status.state !== 'running') {
        report(5, 'Starting the engine');
        await deps.control.start(candidate, signal);
        report(40, 'Waiting for the engine');
        const deadline = Date.now() + (deps.startWithinMs ?? ENGINE_START_MS);
        for (;;) {
          if ((await deps.engine.check()).state === 'running') break;
          if (Date.now() > deadline) throw hlabsError('ENGINE_START_FAILED', 'The engine did not answer in time');
          await new Promise((r) => setTimeout(r, deps.pollMs ?? 2_000));
        }
      }
      report(80, 'Starting apps');
      await deps.appsBack();
      report(100, 'Engine running');
    },
  });
}
