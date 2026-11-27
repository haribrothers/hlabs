import { hlabsError, type AppHandlers } from '@hlabs/api';
import { auditLog, getSetting } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
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
      os: {
        platform: process.platform === 'darwin' ? 'darwin' : 'linux',
        release: release(),
        arch: process.arch,
        headless: config.headless,
      },
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
  // US-SYS-27: the last lines of a source, or the new ones after `since`, masked.
  logs: (input, ctx) => ctx.services.advanced.logs({ ...input, limit: input.limit ?? 500 }),
  // US-SYS-28: the bundle is built as a job; GET /api/diagnostics/:jobId downloads it.
  diagnostics: (_input, ctx) => {
    const { advanced, db } = ctx.services;
    const userId = ctx.identity.kind === 'user' ? ctx.identity.userId : null;
    const jobId = advanced.diagnostics.start(userId);
    db.insert(auditLog)
      .values({
        id: ulid(),
        at: Date.now(),
        userId,
        action: 'system.diagnostics',
        target: jobId,
        detailJson: null,
        ip: ctx.request.ip,
      })
      .run();
    return { jobId };
  },
  // US-SYS-29
  connections: (_input, ctx) => ctx.services.advanced.connections(),
  // US-SYS-31: stops every app, then launchd or systemd starts hlabsd again.
  restartDaemon: (_input, ctx) => {
    const userId = ctx.identity.kind === 'user' ? ctx.identity.userId : null;
    ctx.services.advanced.restart({ userId, ip: ctx.request.ip });
    return { ok: true as const };
  },
  // US-SYS-37, US-SYS-38
  factoryReset: (input, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user') throw hlabsError('ACCESS_DENIED');
    return ctx.services.advanced.reset.start(
      { ...input, keepHomeFolders: input.keepHomeFolders ?? false },
      {
        userId: id.userId,
        role: id.role,
        hasSession: id.session !== undefined,
        ip: ctx.request.ip,
      },
    );
  },
};
