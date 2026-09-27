import type { AppHandlers } from '@hlabs/api';
import { getSetting } from '@hlabs/db';
import { cpus, release, totalmem, uptime } from 'node:os';
import type { DaemonContext } from '../context';

export const system: AppHandlers<DaemonContext>['system'] = {
  health: (_input, ctx) => ({ status: 'ok', version: ctx.services.config.version }),

  info: (_input, ctx) => {
    const { config, db, engine } = ctx.services;
    const status = engine.status;
    const cpuList = cpus();
    return {
      version: config.version,
      hostname: getSetting(db, 'hostname'),
      os: { platform: process.platform === 'darwin' ? 'darwin' : 'linux', release: release(), arch: process.arch },
      cpu: { model: cpuList[0]?.model ?? 'unknown', cores: cpuList.length },
      memoryBytes: totalmem(),
      uptimeSeconds: Math.round(uptime()),
      engine: {
        kind: status.state === 'missing' ? null : status.candidate.kind,
        running: status.state === 'running',
        version: status.state === 'running' ? status.info.version : null,
      },
    };
  },
};
