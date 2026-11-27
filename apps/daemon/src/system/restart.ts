// "Restart hlabs" (US-SYS-31): the `daemon_restart` job stops every app that is up, as "Quit hlabs" does (recorded in
// `settings.paused` with `untilRestart`, so the next start brings exactly those back, D-120), then hlabsd exits with
// code 75 for launchd or systemd to start it again (lifecycle.ts). Meanwhile /healthz says `restarting` and open pages
// hear `system.status { state: 'restarting' }`, so every dashboard shows "Restarting hlabs…" rather than "Can't reach
// hlabs". Refused while an exclusive job runs (D-020); a second press gets the restart already under way.
import type { HlabsDb } from '@hlabs/db';
import { stopRunningApps, type PauseDeps } from '../apps/pause';
import type { EventBus } from '../events/bus';
import type { JobRunner } from '../jobs/runner';
import type { Readiness } from '../readiness';

export interface RestartDeps extends PauseDeps {
  db: HlabsDb;
  jobs: JobRunner;
  bus: EventBus;
  readiness: Readiness;
  /** Stops the daemon and exits with 75 (tests pass a fake). */
  restart: () => void;
  /** How long after the job ends the daemon goes, so the job's end reaches the database and listeners. */
  exitDelayMs?: number;
}

interface RestartPayload {
  userId: string | null;
  ip: string | null;
}

export function registerRestart(deps: RestartDeps): void {
  deps.jobs.register<RestartPayload>('daemon_restart', {
    async run({ payload, report }) {
      await stopRunningApps(
        deps,
        { untilRestart: true, action: 'system.restart', who: { userId: payload.userId, ip: payload.ip } },
        (p) => report(Math.min(p, 99)),
      );
      report(100);
      setTimeout(() => deps.restart(), deps.exitDelayMs ?? 300).unref();
    },
  });
}

/** Starts the restart (or returns the one under way); JOB_EXCLUSIVE_RUNNING while an exclusive job runs. */
export function startRestart(deps: Pick<RestartDeps, 'jobs' | 'bus' | 'readiness'>, who: RestartPayload): string {
  const running = deps.jobs.listActive().find((j) => j.kind === 'daemon_restart');
  if (running) return running.id;
  const jobId = deps.jobs.start<RestartPayload>('daemon_restart', { payload: who });
  deps.readiness.restarting();
  deps.bus.emit('system.status', { state: 'restarting' });
  return jobId;
}
