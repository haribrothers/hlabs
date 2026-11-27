// Settings › Advanced, the daemon's side (US-SYS-27…31, 37, 38): hlabs's logs, the diagnostics bundle, what hlabs
// connects to, Restart hlabs and the factory reset. Built at the end of boot from the other services.
import { hlabsError, type SystemLogSource } from '@hlabs/api';
import { getSetting, storageLocations, users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { join } from 'node:path';
import type { AppLogs } from '../apps/logs';
import type { AppService } from '../apps/service';
import type { InstallService } from '../apps/install';
import type { LoginService } from '../auth/login';
import type { SessionService } from '../auth/sessions';
import type { Destinations } from '../backups/destinations';
import type { DaemonConfig } from '../config';
import type { EngineService } from '../engine/service';
import type { EventBus } from '../events/bus';
import type { JobRunner } from '../jobs/runner';
import type { Logger } from '../logger';
import type { MdnsPublisher } from '../mdns/index';
import type { DnsService } from '../network/dns';
import type { RemoteService } from '../network/remote';
import type { SecretStore } from '../platform/secrets';
import type { Readiness } from '../readiness';
import type { NetworkDrives } from '../storage/drives';
import type { HlabsDb } from '@hlabs/db';

/** The services Advanced uses (boot passes them all). */
export interface AdvancedServices {
  config: DaemonConfig;
  db: HlabsDb;
  bus: EventBus;
  jobs: JobRunner;
  logger: Logger;
  readiness: Readiness;
  secrets: SecretStore;
  engine: EngineService;
  logs: AppLogs;
  sessions: SessionService;
  login: LoginService;
  apps: AppService;
  installer: InstallService;
  remote: RemoteService;
  dns: DnsService;
  mdns: MdnsPublisher;
  networkDrives: NetworkDrives;
  destinations: Destinations;
}
import { updateHost } from '../updates/source';
import { listConnections } from './connections';
import { Diagnostics } from './diagnostics';
import { FactoryReset } from './factory-reset';
import { InstallsLog } from './installs-log';
import { readSystemLogs } from './logs';
import { registerRestart, startRestart } from './restart';

export interface SystemServiceOptions {
  /** Stops the daemon and exits with 75 for launchd or systemd (tests pass a fake). */
  restart: () => void;
  /** Stops what runs on timers before a factory reset deletes (boot gives the same list shutdown stops). */
  quiesce: () => void;
}

export class SystemService {
  readonly diagnostics: Diagnostics;
  readonly reset: FactoryReset;
  readonly installsLog: InstallsLog;

  constructor(
    private readonly s: AdvancedServices,
    private readonly opts: SystemServiceOptions,
  ) {
    const { config, db } = s;
    this.installsLog = new InstallsLog(config.paths.dataDir);
    this.diagnostics = new Diagnostics({
      db,
      jobs: s.jobs,
      logger: s.logger,
      secrets: s.secrets,
      dataDir: config.paths.dataDir,
      version: config.version,
      headless: config.headless,
      hostname: () => getSetting(db, 'hostname'),
      engine: () => {
        const st = s.engine.status;
        return {
          kind: st.state === 'missing' ? null : st.candidate.kind,
          managedByHlabs: st.state === 'missing' ? false : st.candidate.managedByHlabs,
          state: st.state,
          version: st.state === 'running' ? st.info.version : null,
        };
      },
      containerLogs: (appId, since) => s.logs.recent(appId, { tail: 50_000, since }),
    });
    this.reset = new FactoryReset({
      db,
      jobs: s.jobs,
      bus: s.bus,
      logger: s.logger,
      readiness: s.readiness,
      secrets: s.secrets,
      dataDir: config.paths.dataDir,
      appDataDir: config.paths.appDataDir,
      storageRoot: () =>
        db.select({ path: storageLocations.path }).from(storageLocations).where(eq(storageLocations.isRoot, true)).get()
          ?.path ?? config.paths.storageRootDefault,
      quiesce: () => opts.quiesce(),
      sessions: { revokeWhere: (match) => s.sessions.revokeWhere(match) },
      confirmPassword: async (userId, password, ip) => {
        const user = db.select().from(users).where(eq(users.id, userId)).get();
        if (!user) throw hlabsError('AUTH_REQUIRED');
        await s.login.confirmPassword({ user, password, action: 'system.factory_reset', ip });
      },
      apps: { composeDown: (appId, o) => s.apps.composeDown(appId, o) },
      removeAppData: (appId, folder) => s.installer.removeAppFolder(appId, folder),
      disconnectRemote: async (userId) => {
        if (getSetting(db, 'remote').serve.length) await s.remote.disconnect({ userId, ip: null });
      },
      clearDns: async (userId) => {
        const kind = getSetting(db, 'network').dns.kind;
        if (kind === 'adguard' || kind === 'pihole') await s.dns.choose({ kind: 'none' }, { userId, ip: null });
      },
      unpublishNames: () => s.mdns.unpublishAll(),
      unmountDrives: () => s.networkDrives.unmountAll(),
      restart: () => opts.restart(),
    });
  }

  register(): void {
    const s = this.s;
    this.installsLog.attach(s.bus);
    registerRestart({
      db: s.db,
      jobs: s.jobs,
      apps: s.apps,
      logger: s.logger,
      bus: s.bus,
      readiness: s.readiness,
      restart: () => this.opts.restart(),
    });
    this.diagnostics.register();
    this.reset.register();
  }

  logs(input: { source: SystemLogSource; since?: number; limit: number }) {
    return { lines: readSystemLogs(this.s.config.paths.dataDir, input.source, input) };
  }

  connections() {
    const s = this.s;
    return {
      connections: listConnections({
        db: s.db,
        projectsDir: join(s.config.paths.dataDir, 'apps'),
        updateHost: updateHost(),
        destinationHost: (row) => {
          if (row.kind === 'local') return null;
          const config = row.configJson as { type?: string };
          if (config.type === 'external') return null;
          return s.destinations.label(row);
        },
      }),
    };
  }

  restart(who: { userId: string | null; ip: string | null }): void {
    startRestart({ jobs: this.s.jobs, bus: this.s.bus, readiness: this.s.readiness }, who);
  }
}
