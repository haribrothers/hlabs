// What the tray shows at a glance (US-INST-05): hlabs's state, how many apps run, how busy this computer is and the
// dashboard's address. The tray asks every 5 s while its menu is open and every 30 s otherwise.
import type { TrayStatus } from '@hlabs/api';
import {
  apps,
  backupDestinations,
  backupRuns,
  getSetting,
  getUserSetting,
  storageLocations,
  users,
  type HlabsDb,
} from '@hlabs/db';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { DaemonConfig } from '../config';
import type { EngineService } from '../engine/service';
import type { JobRunner } from '../jobs/runner';
import type { NetworkService } from '../network/service';
import type { HostStats } from '../platform/host-stats';
import type { SystemProbe } from '../platform/system';

/** An app on its way up. */
const COMING_UP = new Set(['starting', 'restarting']);

export interface TrayStatusDeps {
  isReconciling(): boolean;
  config: DaemonConfig;
  db: HlabsDb;
  engine: EngineService;
  jobs: JobRunner;
  routing: NetworkService;
  system: SystemProbe;
  host: HostStats;
}

/** The dashboard's address now: hlabs's `.local` name, or the LAN address while it can't be published; without Caddy
 * (development) the configured one. */
export function dashboardUrl(deps: Pick<TrayStatusDeps, 'config' | 'routing'>): string {
  if (deps.config.proxy !== 'caddy') return deps.config.dashboardUrl;
  const home = deps.routing.homeNetwork();
  return home.published ? home.localAddress : (home.fallbackAddress ?? home.localAddress);
}

async function freeBytes(deps: TrayStatusDeps): Promise<number | null> {
  const root = deps.db
    .select({ path: storageLocations.path })
    .from(storageLocations)
    .where(eq(storageLocations.isRoot, true))
    .get();
  try {
    return await deps.system.freeBytes(root?.path ?? deps.config.paths.dataDir);
  } catch {
    return null;
  }
}

function backup(db: HlabsDb): TrayStatus['backup'] {
  const configured = db.select({ id: backupDestinations.id }).from(backupDestinations).limit(1).get() !== undefined;
  const last = db.select().from(backupRuns).orderBy(desc(backupRuns.startedAt)).limit(1).get();
  const lastSucceeded = db
    .select({ finishedAt: backupRuns.finishedAt })
    .from(backupRuns)
    .where(eq(backupRuns.status, 'succeeded'))
    .orderBy(desc(backupRuns.finishedAt))
    .limit(1)
    .get();
  return {
    configured,
    lastSucceededAt: lastSucceeded?.finishedAt ?? null,
    running: last?.status === 'running',
    progress: null,
    lastFailed: last?.status === 'failed',
  };
}

/** The first enabled admin's "Reduce transparency" (the tray has no signed-in person). */
function reduceTransparency(db: HlabsDb): boolean {
  const admin = db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), isNull(users.disabledAt)))
    .orderBy(asc(users.createdAt))
    .limit(1)
    .get();
  return admin ? getUserSetting(db, 'appearance', admin.id).reduceTransparency : false;
}

export async function trayStatus(deps: TrayStatusDeps): Promise<TrayStatus> {
  const { db } = deps;
  const engine = deps.engine.status;
  const installed = db
    .select({ id: apps.id, state: apps.state, autostart: apps.autostart })
    .from(apps)
    .orderBy(asc(apps.id))
    .all();
  const autostartAll = getSetting(db, 'startup').autostartApps;
  const expected = installed.filter((a) => a.state === 'running' || (autostartAll && a.autostart));
  const appsRunning = installed.filter((a) => a.state === 'running').length;
  const starting = engine.state === 'running' && (deps.isReconciling() || expected.some((a) => COMING_UP.has(a.state)));
  const updates = getSetting(db, 'updates');
  const paused = getSetting(db, 'paused') !== null;
  const [cpu, memory, free] = await Promise.all([deps.host.cpuPercent(), deps.host.memoryUsedBytes(), freeBytes(deps)]);
  return {
    state: engine.state !== 'running' ? 'engineStopped' : paused ? 'paused' : starting ? 'starting' : 'running',
    appsRunning,
    appsExpected: expected.length,
    appsNeedAttention: installed.filter((a) => a.state === 'error').length,
    startupLogAppId: expected.find((a) => a.state !== 'running')?.id ?? null,
    paused,
    cpuPercent: cpu === null ? null : Math.min(100, Math.max(0, cpu)),
    memoryUsedBytes: memory,
    freeBytes: free,
    engine: {
      name: engine.state === 'missing' ? null : engine.candidate.kind,
      running: engine.state === 'running',
      managedByHlabs: engine.state === 'missing' ? false : engine.candidate.managedByHlabs,
      canStart: engine.state !== 'missing' && engine.candidate.kind !== 'docker-engine',
    },
    dashboardUrl: dashboardUrl(deps),
    backup: backup(db),
    updateChannel: updates.channel,
    autoUpdate: updates.autoHlabs,
    exclusiveJobRunning: deps.jobs.exclusiveRunning(),
    onboardingComplete: getSetting(db, 'onboarding').completedAt !== null,
    reduceTransparency: reduceTransparency(db),
  };
}
