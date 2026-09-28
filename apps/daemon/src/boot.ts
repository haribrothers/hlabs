// The daemon boot sequence (docs/prd/02-architecture.md §2.3). The HTTP server is already listening,
// so /healthz reports each step and, if the database can't be opened, why.
import { apps, MigrationFailedError, openDb, SchemaTooNewError, getSetting, setSetting } from '@hlabs/db';
import { nextOrigins } from '@hlabs/shared';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NoopProxyManager, type ProxyManager } from './caddy/index';
import type { DaemonConfig } from './config';
import type { InstallerHost } from './engine/colima-installer';
import { registerEngineInstall } from './engine/install-job';
import { nodeInstallerHost } from './engine/installer-host';
import { defaultCandidates, EngineService, type EngineServiceDeps } from './engine/service';
import { EventBus } from './events/bus';
import { JobRunner } from './jobs/runner';
import type { Logger } from './logger';
import { NoopMdnsPublisher, type MdnsPublisher } from './mdns/index';
import { SessionService } from './auth/sessions';
import { TotpService } from './auth/totp';
import { LoginService } from './auth/login';
import { OnboardingService } from './onboarding/service';
import { NodeDriveProbe, type DriveProbe } from './platform/drives';
import { LinuxNetworkMounter, MacNetworkMounter, type NetworkMounter } from './platform/network-mount';
import { NetworkStorage } from './storage/network';
import { NodeSystemProbe, type SystemProbe } from './platform/system';
import { createSecretStore, type SecretStore } from './platform/secrets';
import type { Readiness } from './readiness';
import type { ServiceHolder, Services } from './services';

declare const __HLABS_BUNDLE__: boolean | undefined;

/** In the bundle, migrations are copied next to hlabsd.mjs; from source, @hlabs/db finds its own. */
const bundledMigrationsDir =
  typeof __HLABS_BUNDLE__ !== 'undefined' ? fileURLToPath(new URL('./migrations', import.meta.url)) : undefined;

export interface BootDeps {
  config: DaemonConfig;
  logger: Logger;
  readiness: Readiness;
  holder: ServiceHolder;
  /** Overrides for tests (fake engine, etc.). */
  engine?: Partial<EngineServiceDeps>;
  proxy?: ProxyManager;
  mdns?: MdnsPublisher;
  secrets?: SecretStore;
  system?: SystemProbe;
  drives?: DriveProbe;
  mounter?: NetworkMounter;
  /** Downloads, tar and colima for the engine install (US-ONB-05). */
  installer?: InstallerHost;
  /** The user's home (where ~/.colima lives). */
  home?: string;
  /** Where the setup URL is printed (stdout). */
  print?: (line: string) => void;
}

export async function boot(deps: BootDeps): Promise<Services | null> {
  const { config, logger, readiness, holder } = deps;

  // 1. Config, database, migrations.
  readiness.step(0);
  try {
    mkdirSync(config.paths.dataDir, { recursive: true });
  } catch (err) {
    logger.fatal({ err, dataDir: config.paths.dataDir }, 'data directory is not writable');
    readiness.fail('storage_unavailable');
    return null;
  }
  let db;
  try {
    db = openDb({ dataDir: config.paths.dataDir, migrationsDir: bundledMigrationsDir });
  } catch (err) {
    logger.fatal({ err }, err instanceof SchemaTooNewError ? 'database is newer than this hlabs' : 'migration failed');
    if (err instanceof MigrationFailedError || err instanceof SchemaTooNewError) readiness.fail('migration_failed');
    else readiness.fail('storage_unavailable');
    return null;
  }
  const bus = new EventBus();
  const jobs = new JobRunner(db, bus, logger);
  jobs.recover();
  if (config.dev || config.env === 'test') {
    jobs.register<{ steps?: number }>('noop', {
      cancellable: true,
      async run({ report, payload, signal }) {
        const steps = payload?.steps ?? 1;
        for (let i = 1; i <= steps && !signal.aborted; i++) report((i / steps) * 100);
      },
    });
  }

  // 2. Container engine (engine-stopped mode if missing; retries every 10 s).
  readiness.step(1);
  const engine = new EngineService({
    bus,
    logger,
    preferred: () => getSetting(db, 'engine').preferred,
    // Development only: behave like a Mac with no engine except hlabs's own Colima.
    ...(config.devIgnoreEngines
      ? { candidates: async () => (await defaultCandidates('auto')).filter((c) => c.managedByHlabs) }
      : {}),
    ...deps.engine,
  });
  const engineStatus = await engine.start();
  logger.info({ engine: engineStatus.state }, 'container engine checked');

  // 3. Caddy base config and mDNS names (real implementations arrive in phase 2).
  readiness.step(2);
  const proxy = deps.proxy ?? new NoopProxyManager();
  const mdns = deps.mdns ?? new NoopMdnsPublisher();
  await proxy.start();
  await mdns.publish(getSetting(db, 'hostname'));

  // 4. Reconcile installed apps with the engine (phase 2: AppService).
  readiness.step(3);

  // 5. Scheduler: backups, update checks, health probes, usage sampling (added by their phases).
  readiness.step(4);

  // First run: keep the setup token ready and print the setup URL (US-ONB-01, D-041).
  const probe = deps.system ?? new NodeSystemProbe();
  registerEngineInstall({
    jobs,
    engine,
    probe,
    io: deps.installer ?? nodeInstallerHost(),
    dataDir: config.paths.dataDir,
    home: deps.home ?? homedir(),
    onDownload: () =>
      setSetting(db, 'connections', {
        ...getSetting(db, 'connections'),
        engineDownload: { lastContactAt: Date.now() },
      }),
  });
  const secrets = deps.secrets ?? createSecretStore(config.secretStore, config.paths.dataDir);
  const onboarding = new OnboardingService({
    db,
    secrets,
    dashboardUrl: config.dashboardUrl,
    jobs,
    bus,
    dataDir: config.paths.dataDir,
    engineInstallAllowed: !config.devNoEngineInstall,
    systemCheck: {
      engine,
      probe,
      storageRoot: config.paths.storageRootDefault,
      headless: config.headless,
    },
  });
  const setupUrl = await onboarding.prepareSetupToken();
  if (setupUrl) {
    logger.info({ setupUrl }, 'hlabs is not set up yet: open the setup URL to start');
    const print = deps.print ?? ((line: string) => void process.stdout.write(`${line}\n`));
    print(`\n  Set up hlabs: open ${setupUrl}\n`);
  }

  const sessions = new SessionService(db, bus);
  const totp = new TotpService(db, secrets);
  const services: Services = {
    config,
    logger,
    readiness,
    db,
    bus,
    jobs,
    engine,
    secrets,
    proxy,
    mdns,
    onboarding,
    sessions,
    totp,
    login: new LoginService(db, sessions, totp, bus, () =>
      nextOrigins({
        dashboardUrl: config.dashboardUrl,
        hostname: getSetting(db, 'hostname'),
        apps: db.select({ hostname: apps.hostname, port: apps.portFallback }).from(apps).all(),
        tailnet: getSetting(db, 'remote').tailnetName,
      }),
    ),
    drives: deps.drives ?? new NodeDriveProbe(),
    network: new NetworkStorage({
      db,
      secrets,
      mounter:
        deps.mounter ??
        (process.platform === 'darwin'
          ? new MacNetworkMounter(config.netmountHelper)
          : new LinuxNetworkMounter(config.privHelper, join(config.paths.dataDir, 'tmp'))),
      mountsDir: join(config.paths.dataDir, 'mounts'),
    }),
  };
  holder.set(services);
  services.login.startPruning();

  // 6. Ready.
  readiness.ready();
  bus.emit('system.status', { state: 'ready' });
  logger.info({ version: config.version, port: config.port }, 'hlabsd is ready');
  return services;
}

export async function shutdown(services: Services | null): Promise<void> {
  if (!services) return;
  services.engine.stop();
  services.login.stop();
  await services.jobs.shutdown();
  await services.mdns.unpublishAll();
  await services.proxy.stop();
  services.db.$client.close();
}
