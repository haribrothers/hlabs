import { hlabsError, type AppHandlers } from '@hlabs/api';
import { storageLocations } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { cpus, totalmem } from 'node:os';
import type { DaemonContext } from '../context';
import { onlyApps, usageAppsFor } from '../usage/members';

/** The storage root's disk by use (US-USE-04); apps and files are counted from their phases, so far the rest is system. */
function storageByUse(disk: { totalBytes: number; freeBytes: number }) {
  const usedBytes = Math.max(0, disk.totalBytes - disk.freeBytes);
  return { usedBytes, totalBytes: disk.totalBytes, appsBytes: 0, filesBytes: 0, systemBytes: usedBytes };
}

export const usage: AppHandlers<DaemonContext>['usage'] = {
  // US-USE-01: CPU model and cores, total memory, the storage root's disk and the engine's allocation.
  overview: async (_input, ctx) => {
    const { engine, system, db, config } = ctx.services;
    const root = db
      .select({ path: storageLocations.path })
      .from(storageLocations)
      .where(eq(storageLocations.isRoot, true))
      .get();
    const disk = await system.diskSpace(root?.path ?? config.paths.dataDir).catch(() => null);
    const status = engine.status;
    const list = cpus();
    return {
      cpuModel: list[0]?.model.trim() ?? '',
      cores: list.length,
      memTotalBytes: totalmem(),
      storage: disk ? storageByUse(disk) : null,
      engine: {
        kind: status.state === 'missing' ? null : status.candidate.kind,
        running: status.state === 'running',
        cpus: status.state === 'running' ? status.info.cpus : null,
        memoryBytes: status.state === 'running' ? status.info.memoryBytes : null,
      },
    };
  },

  // US-USE-08: the latest sample (members' access is checked in DaemonContext.authorize, D-029).
  current: (_input, ctx) => {
    const latest = ctx.services.usage.latest();
    return latest && onlyApps(latest, usageAppsFor(ctx.services.db, ctx.identity));
  },
  // US-USE-04: the five apps using the most memory over the range, and the rest; a member only their apps.
  memoryByApp: ({ range }, ctx) => {
    const { usageHistory, catalog } = ctx.services;
    const result = usageHistory.memoryByApp(range, usageAppsFor(ctx.services.db, ctx.identity));
    return {
      ...result,
      series: result.series.map((s) => ({ ...s, name: catalog.get(s.appId)?.manifest.name ?? s.appId })),
    };
  },
  // US-USE-09: points at the right resolution and the metric's peak.
  history: ({ scope, range, metric }, ctx) => {
    // A member only sees the history of apps shared with them (US-USE-02).
    const allowed = usageAppsFor(ctx.services.db, ctx.identity);
    if (scope !== 'host' && allowed !== null && !allowed.has(scope)) throw hlabsError('ACCESS_DENIED');
    return ctx.services.usageHistory.history(scope, range, metric);
  },
};
