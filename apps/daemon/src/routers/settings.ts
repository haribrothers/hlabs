import { hlabsError, type AppHandlers } from '@hlabs/api';
import { getSetting } from '@hlabs/db';
import { homedir } from 'node:os';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { DaemonContext } from '../context';
import { engineDir } from '../engine/install-job';
import { currentColima, engineOverview, resourceLimits, resourcesProblem } from '../engine/overview';

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
        host: {
          ...system.resources(),
          freeDiskBytes: (await system.diskSpace(homedir())).freeBytes,
        },
        colimaResources: getSetting(ctx.services.db, 'engine').resources,
      });
    },
    /** Apply new resources to hlabs's Colima by restarting it (US-SYS-19). */
    setResources: async (input, ctx) => {
      const { engine, system, db, jobs } = ctx.services;
      const status = engine.status;
      if (status.state === 'missing' || status.candidate.kind !== 'colima' || !status.candidate.managedByHlabs) {
        throw hlabsError('VALIDATION_FAILED', "Only hlabs's own Colima can be resized here");
      }
      const host = { ...system.resources(), freeDiskBytes: (await system.diskSpace(homedir())).freeBytes };
      const current = currentColima({ host, colimaResources: getSetting(db, 'engine').resources });
      const limits = resourceLimits(host, current.diskBytes);
      const problem = resourcesProblem(input, limits);
      if (problem) throw hlabsError('VALIDATION_FAILED', `${problem} out of range`, { field: problem, limits });
      const userId = ctx.identity.kind === 'user' ? ctx.identity.userId : null;
      return { jobId: jobs.start('engine_restart', { payload: { userId, resources: input } }) };
    },
  },
};
