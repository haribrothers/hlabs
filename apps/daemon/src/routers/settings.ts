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

export const settings: AppHandlers<DaemonContext>['settings'] = {
  engine: {
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
