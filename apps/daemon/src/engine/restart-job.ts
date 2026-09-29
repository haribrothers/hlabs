// The engine_restart job (US-SYS-18, US-SYS-19): restart the engine (optionally with new Colima resources), wait up
// to 3 minutes for it to answer, then bring back apps set to start automatically (apps arrive in phase 2).
import { hlabsError } from '@hlabs/api';
import { auditLog, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import type { JobRunner } from '../jobs/runner';
import type { ColimaResources, EngineControl } from './control';
import type { EngineService } from './service';

export const ENGINE_BACK_MS = 3 * 60_000;

export interface EngineRestartPayload {
  userId: string | null;
  /** Apply these (hlabs's Colima) on the way back up (US-SYS-19). */
  resources?: ColimaResources;
}

export function registerEngineRestart(deps: {
  jobs: JobRunner;
  engine: EngineService;
  control: EngineControl;
  db: HlabsDb;
  backWithinMs?: number;
  pollMs?: number;
  /** Called with the new resources once they're applied. */
  onResources?(resources: ColimaResources): void;
}): void {
  deps.jobs.register<EngineRestartPayload>('engine_restart', {
    async run({ payload, signal, report }) {
      const status = deps.engine.status;
      if (status.state === 'missing') throw hlabsError('ENGINE_UNAVAILABLE');
      deps.db
        .insert(auditLog)
        .values({
          id: ulid(),
          at: Date.now(),
          userId: payload.userId,
          action: 'engine.restart',
          target: status.candidate.kind,
          detailJson: payload.resources ? { resources: payload.resources } : null,
          ip: null,
        })
        .run();
      report(5, 'Stopping the engine');
      if (payload.resources) await deps.control.restartColimaWith(payload.resources, signal);
      else await deps.control.restart(status.candidate, signal);
      report(60, 'Waiting for the engine');

      const deadline = Date.now() + (deps.backWithinMs ?? ENGINE_BACK_MS);
      for (;;) {
        const now = await deps.engine.check();
        if (now.state === 'running') break;
        if (Date.now() > deadline) throw hlabsError('ENGINE_START_FAILED', 'The engine did not come back in time');
        await new Promise((r) => setTimeout(r, deps.pollMs ?? 2_000));
      }
      if (payload.resources) deps.onResources?.(payload.resources);
      // Apps set to start automatically come back here once AppService exists (phase 2).
      report(100, 'Engine running');
    },
  });
}
