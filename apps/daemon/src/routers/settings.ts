import type { AppHandlers } from '@hlabs/api';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { DaemonContext } from '../context';
import { engineDir } from '../engine/install-job';
import { engineOverview } from '../engine/overview';

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** Restart (or start) the engine as a job (US-SYS-18); one at a time: a second call gets the running one. */
function restartEngine(ctx: DaemonContext) {
  const { jobs } = ctx.services;
  const running = jobs.listActive().find((j) => j.kind === 'engine_restart');
  if (running) return { jobId: running.id };
  const userId = ctx.identity.kind === 'user' ? ctx.identity.userId : null;
  return { jobId: jobs.start('engine_restart', { payload: { userId } }) };
}

export const settings: AppHandlers<DaemonContext>['settings'] = {
  engine: {
    restart: (_input, ctx) => restartEngine(ctx),
    start: (_input, ctx) => restartEngine(ctx),
    get: async (_input, ctx) => {
      const { engine, system, jobs, config } = ctx.services;
      const os = await system.os();
      return engineOverview({
        platform: os.platform,
        status: engine.status,
        busy: jobs.listActive().some((j) => j.kind === 'engine_restart' || j.kind === 'engine_install'),
        installedApps: await system.installedEngineApps(),
        colimaInstalled: await exists(join(engineDir(config.paths.dataDir), 'bin', 'colima')),
      });
    },
  },
};
