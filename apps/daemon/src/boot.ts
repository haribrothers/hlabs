// The daemon boot sequence (docs/prd/02-architecture.md §2.3). The HTTP server is already listening,
// so /healthz reports each step and, if the database can't be opened, why.
import { NotificationService } from './notifications/service';
import { noEngineControl, nodeEngineControl, type EngineControl } from './engine/control';
import { KeepAwake, processSleepBlocker, type SleepBlocker } from './platform/keep-awake';
import { eq } from 'drizzle-orm';
import { registerEngineRestart } from './engine/restart-job';
import { registerEngineStart } from './engine/start-job';
import { registerPause } from './apps/pause';
import { registerHomeFolderTrash } from './users/home-trash-job';
import { watchEngine } from './engine/watch';
import { apps, MigrationFailedError, openDb, SchemaTooNewError, getSetting, setSetting } from '@hlabs/db';
import { nextOrigins } from '@hlabs/shared';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NoopProxyManager, type ProxyManager } from './caddy/index';
import { CaddyProxy } from './caddy/proxy';
import { NetworkService } from './network/service';
import type { DaemonConfig } from './config';
import type { InstallerHost } from './engine/colima-installer';
import { engineDir, registerEngineInstall } from './engine/install-job';
import { nodeInstallerHost } from './engine/installer-host';
import { defaultCandidates, EngineService, type EngineServiceDeps } from './engine/service';
import { EventBus } from './events/bus';
import { CatalogService } from './store/catalog';
import { StoreService, type StoreHost } from './store/service';
import { InstallService } from './apps/install';
import { AppService } from './apps/service';
import { CliComposeRunner, type ComposeRunner } from './apps/compose';
import type { HealthProbes } from './apps/health';
import { JobRunner } from './jobs/runner';
import type { Logger } from './logger';
import { NoopMdnsPublisher, type MdnsPublisher } from './mdns/index';
import { ChildRegistry } from './platform/children';
import { createMdnsPublisher, lanAddress, lanAddresses } from './mdns/publisher';
import { DNS_RETRY_MS, DnsService } from './network/dns';
import { RemoteService } from './network/remote';
import { FakeTailscale } from './tailscale/fake';
import { LocalApiTailscale } from './tailscale/localapi';
import type { TailscaleClient } from './tailscale/types';
import { AppDiskUsage } from './apps/disk';
import { AppLogs } from './apps/logs';
import { UpdateService } from './apps/update';
import { SessionService } from './auth/sessions';
import { TotpService } from './auth/totp';
import { LoginService } from './auth/login';
import { OnboardingService } from './onboarding/service';
import { NodeDriveProbe, type DriveProbe } from './platform/drives';
import { LinuxNetworkMounter, MacNetworkMounter, type NetworkMounter } from './platform/network-mount';
import { NetworkStorage } from './storage/network';
import { SystemHostStats, type HostStats } from './platform/host-stats';
import { UsageHistory } from './usage/history';
import { UsageSampler } from './usage/sampler';
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
  /** The Tailscale on this computer (a fake in tests, and with HLABS_DEV_FAKE_TAILSCALE). */
  tailscale?: TailscaleClient;
  secrets?: SecretStore;
  system?: SystemProbe;
  host?: HostStats;
  /** Tests that drive the sampler themselves turn the 5 s timer off. */
  sampleUsage?: boolean;
  drives?: DriveProbe;
  mounter?: NetworkMounter;
  /** Downloads, tar and colima for the engine install (US-ONB-05). */
  installer?: InstallerHost;
  /** Restarts the engine (US-SYS-18); tests pass a fake. */
  engineControl?: EngineControl;
  /** App stacks (compose CLI); tests pass a fake. */
  compose?: ComposeRunner;
  healthProbes?: HealthProbes;
  /** Whether a loopback port is free (app ports); tests pass a fake. */
  isPortFree?: (port: number) => Promise<boolean>;
  /** This computer, for platform checks; tests pass one. */
  storeHost?: StoreHost;
  /** Holds off sleep (US-SYS-20); tests pass a fake. */
  sleepBlocker?: SleepBlocker;
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

  // 3. Caddy and mDNS names, from the database (D-006).
  readiness.step(2);
  const appService = new AppService({
    db,
    bus,
    logger,
    engine,
    compose:
      deps.compose ??
      new CliComposeRunner({
        binDir: config.resources.binDir,
        socketPath: () => (engine.status.state === 'running' ? engine.status.candidate.socketPath : null),
      }),
    projectsDir: join(config.paths.dataDir, 'apps'),
    projectPrefix: config.composePrefix,
    probes: deps.healthProbes,
  });
  // Caddy and the mDNS publishers a killed daemon left running go first (they'd hold port 443 and the names).
  const children = new ChildRegistry(join(config.paths.dataDir, 'run', 'children.json'));
  const reaped = children.reapStale();
  if (reaped) logger.warn({ reaped }, 'ended helper processes a previous daemon left running');
  // Remote access first: starting Caddy frees the web ports Tailscale Serve holds for hlabs (D-111).
  const tailscale = deps.tailscale ?? (config.devFakeTailscale ? new FakeTailscale() : new LocalApiTailscale());
  const sessions = new SessionService(db, bus);
  const remote = new RemoteService({
    db,
    tailscale,
    sessions,
    logger,
    dashboardUpstream: config.dashboardUpstream,
    routes: () => appService.routes(),
  });
  const proxy =
    deps.proxy ??
    (config.proxy === 'caddy'
      ? new CaddyProxy({
          binary: join(config.resources.binDir, 'caddy'),
          dir: join(config.paths.dataDir, 'caddy'),
          webFallbackDir: config.resources.webFallbackDir,
          logger,
          children,
          aroundStart: (ports, start) => remote.whileReleased(ports, start),
        })
      : new NoopProxyManager());
  const mdns =
    deps.mdns ??
    (config.mdns
      ? createMdnsPublisher(logger, () => getSetting(db, 'network').ports.https, children)
      : new NoopMdnsPublisher());
  const network = new NetworkService({
    db,
    proxy,
    mdns,
    logger,
    routes: () => appService.routes(),
    dashboardUpstream: config.dashboardUpstream,
    daemon: `127.0.0.1:${config.port}`,
  });
  await network.sync();
  network.watch(bus);
  const secrets = deps.secrets ?? createSecretStore(config.secretStore, config.paths.dataDir);
  const dns = new DnsService({
    db,
    secrets,
    logger,
    lanAddress: () => lanAddress(),
  });
  // Apps installed or uninstalled get or lose their tailnet address (US-SYS-04) and DNS records (US-SYS-06).
  bus.on(({ event }) => {
    if (event.type !== 'app.stateChanged') return;
    void remote.reconcile();
    void dns.sync();
  });
  // At start too: a tailnet that changed while hlabs was off, or Serve entries from before D-110, are brought up to date.
  void remote.reconcile();
  // A DNS server that didn't answer, or a LAN address that changed, is caught up with regularly: the records, and
  // Caddy's certificates for the LAN address (sync applies only when something changed).
  const dnsTimer = setInterval(() => {
    void dns.sync();
    void network.sync();
  }, DNS_RETRY_MS);
  dnsTimer.unref();
  void dns.sync();

  // 4. The built-in store, then reconcile installed apps with the engine.
  readiness.step(3);
  const catalog = new CatalogService(db, config.resources.storeDir, logger);
  const { synced, skipped } = catalog.syncBuiltin();
  logger.info({ apps: synced.length, skipped: skipped.length }, 'built-in store loaded');
  // Health waits take up to minutes, so apps come up in the background; /healthz doesn't wait for them.
  // How many reconciles are waiting or running: while any is, the tray says "Starting" (US-INST-11).
  let pendingReconciles = 1;
  const reconcileOnce = () =>
    appService
      .reconcile()
      .catch((err: unknown) => logger.error({ err }, 'reconciling apps failed'))
      .finally(() => pendingReconciles--);
  const reconciled = reconcileOnce();
  // Later reconciles (the engine came back, US-STATE-09, US-STATE-10) run one after another, after this one.
  let reconciling: Promise<void> = reconciled;
  const appsBack = () => {
    pendingReconciles++;
    return (reconciling = reconciling.then(reconcileOnce));
  };

  // 5. Scheduler: backups, update checks, health probes, usage sampling (added by their phases).
  readiness.step(4);

  // First run: keep the setup token ready and print the setup URL (US-ONB-01, D-041).
  const probe = deps.system ?? new NodeSystemProbe();
  const host = deps.host ?? new SystemHostStats();
  const sampler = new UsageSampler({ db, bus, engine, host, logger, composePrefix: config.composePrefix });
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
  const engineControl =
    deps.engineControl ??
    (config.devNoEngineControl
      ? noEngineControl({ onStart: () => engine.simulateStop(false) })
      : nodeEngineControl({ engineDir: engineDir(config.paths.dataDir), privHelper: config.privHelper }));
  registerEngineRestart({
    jobs,
    engine,
    db,
    control: engineControl,
    onResources: (resources) => setSetting(db, 'engine', { ...getSetting(db, 'engine'), resources }),
  });
  registerEngineStart({ jobs, engine, db, control: engineControl, appsBack });
  registerHomeFolderTrash({ jobs, db });
  registerPause({ jobs, db, apps: appService, logger });
  const onboarding = new OnboardingService({
    db,
    secrets,
    dashboardUrl: config.dashboardUrl,
    jobs,
    bus,
    dataDir: config.paths.dataDir,
    engineInstallAllowed: !config.devNoEngineInstall,
    phase: config.phase,
    onCompleted: () => void network.sync(),
    onNetworkChanged: () => void network.sync(),
    systemCheck: {
      engine,
      probe,
      storageRoot: config.paths.storageRootDefault,
      headless: config.headless,
      // Caddy holds the saved web ports while it runs.
      ownPorts: () => {
        if (config.proxy !== 'caddy') return [];
        const { http, https } = getSetting(db, 'network').ports;
        return [http, https];
      },
    },
  });
  const setupUrl = await onboarding.prepareSetupToken();
  if (setupUrl) {
    logger.info({ setupUrl }, 'hlabs is not set up yet: open the setup URL to start');
    const print = deps.print ?? ((line: string) => void process.stdout.write(`${line}\n`));
    print(`\n  Set up hlabs: open ${setupUrl}\n`);
  }

  const totp = new TotpService(db, secrets);
  const notifications = new NotificationService(db, bus);
  watchEngine({
    bus,
    engine,
    notifications,
    appsBack,
    setUp: () => getSetting(db, 'onboarding').completedAt !== null,
  });
  const store = new StoreService(db, catalog, deps.storeHost, {
    engineMemoryBytes: () => (engine.status.state === 'running' ? engine.status.info.memoryBytes : null),
    appDataFreeBytes: () => probe.freeBytes(config.paths.appDataDir),
  });
  const disk = new AppDiskUsage({
    appDataDir: config.paths.appDataDir,
    engine,
    project: (appId) => appService.project(appId).name,
  });
  const installer = new InstallService({
    disk,
    db,
    bus,
    logger,
    jobs,
    catalog,
    apps: appService,
    engine,
    network,
    notifications,
    host: store.host,
    appDataDir: config.paths.appDataDir,
    appDataFreeBytes: () => probe.freeBytes(config.paths.appDataDir),
    isPortFree: deps.isPortFree,
    probes: deps.healthProbes,
  });
  installer.register();
  const updates = new UpdateService({
    db,
    logger,
    jobs,
    catalog,
    apps: appService,
    installer,
    engine,
    notifications,
    probes: deps.healthProbes,
  });
  updates.register();
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
    catalog,
    store,
    installer,
    updates,
    logs: new AppLogs({ engine, project: (appId) => appService.project(appId).name }),
    routing: network,
    remote,
    tailscale,
    dns,
    apps: appService,
    reconciled,
    isReconciling: () => pendingReconciles > 0,
    onboarding,
    sessions,
    totp,
    login: new LoginService(db, sessions, totp, bus, () =>
      nextOrigins({
        dashboardUrl: config.dashboardUrl,
        hostname: getSetting(db, 'hostname'),
        apps: db.select({ hostname: apps.hostname, port: apps.portFallback }).from(apps).all(),
        tailnet: getSetting(db, 'remote').tailnetName,
        tailnetNode: getSetting(db, 'remote').nodeName,
        tailnetDashboardPort: getSetting(db, 'remote').dashboardPort,
        lanAddresses: lanAddresses(),
        httpsPort: getSetting(db, 'network').ports.https,
      }),
    ),
    notifications,
    drives: deps.drives ?? new NodeDriveProbe(),
    system: probe,
    host,
    usage: sampler,
    usageHistory: new UsageHistory({ db, recent: () => sampler.recent(), logger }),
    keepAwake: new KeepAwake(deps.sleepBlocker ?? processSleepBlocker(), () => ({
      keepAwake: getSetting(db, 'startup').keepAwake,
      appsRunning: db.select({ id: apps.id }).from(apps).where(eq(apps.state, 'running')).all().length,
    })),
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
  // Keep awake follows the setting and whether any app runs.
  services.keepAwake.update();
  bus.on((entry) => {
    if (entry.event.type === 'app.stateChanged') services.keepAwake.update();
  });
  services.login.startPruning();

  // 6. Ready; usage sampling starts (US-USE-08).
  readiness.ready();
  if (deps.sampleUsage !== false) {
    services.usage.start();
    services.usageHistory.start();
  }
  bus.emit('system.status', { state: 'ready' });
  logger.info({ version: config.version, port: config.port }, 'hlabsd is ready');
  return services;
}

export async function shutdown(services: Services | null): Promise<void> {
  if (!services) return;
  services.engine.stop();
  services.usage.stop();
  services.usageHistory.stop();
  // The last finished minute is written before stopping, so a restart loses at most the minute in progress.
  try {
    services.usageHistory.flush();
  } catch {
    // Shutting down anyway.
  }
  services.login.stop();
  services.keepAwake.stop();
  await services.jobs.shutdown();
  await services.mdns.unpublishAll();
  await services.proxy.stop();
  services.db.$client.close();
}
