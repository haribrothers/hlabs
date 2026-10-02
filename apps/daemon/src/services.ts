// The daemon's services, constructed once at boot and passed to every request context.
import type { HlabsDb } from '@hlabs/db';
import type { ProxyManager } from './caddy/index';
import type { DaemonConfig } from './config';
import type { EngineService } from './engine/service';
import type { EventBus } from './events/bus';
import type { JobRunner } from './jobs/runner';
import type { Logger } from './logger';
import type { MdnsPublisher } from './mdns/index';
import type { SessionService } from './auth/sessions';
import type { TotpService } from './auth/totp';
import type { LoginService } from './auth/login';
import type { OnboardingService } from './onboarding/service';
import type { DriveProbe } from './platform/drives';
import type { KeepAwake } from './platform/keep-awake';
import type { HostStats } from './platform/host-stats';
import type { SystemProbe } from './platform/system';
import type { NotificationService } from './notifications/service';
import type { NetworkStorage } from './storage/network';
import type { SecretStore } from './platform/secrets';
import type { Readiness } from './readiness';
import type { CatalogService } from './store/catalog';
import type { StoreService } from './store/service';
import type { InstallService } from './apps/install';
import type { AppService } from './apps/service';
import type { DnsService } from './network/dns';
import type { RemoteService } from './network/remote';
import type { NetworkService } from './network/service';
import type { TailscaleClient } from './tailscale/types';
import type { AppLogs } from './apps/logs';
import type { UpdateService } from './apps/update';

export interface Services {
  config: DaemonConfig;
  logger: Logger;
  readiness: Readiness;
  db: HlabsDb;
  bus: EventBus;
  jobs: JobRunner;
  engine: EngineService;
  secrets: SecretStore;
  proxy: ProxyManager;
  mdns: MdnsPublisher;
  catalog: CatalogService;
  store: StoreService;
  /** Installs apps (US-STORE-08…14). */
  installer: InstallService;
  /** Updates and their rollback (US-STORE-17). */
  updates: UpdateService;
  apps: AppService;
  /** Apps' container logs (US-APP-08…10). */
  logs: AppLogs;
  /** Caddy and mDNS names (02 §2.6). */
  routing: NetworkService;
  /** Remote access with Tailscale (US-SYS-02…04). */
  remote: RemoteService;
  /** The local DNS server hlabs keeps its names in (US-SYS-06). */
  dns: DnsService;
  tailscale: TailscaleClient;
  /** Settles when the start-up reconcile has finished (tests). */
  reconciled: Promise<void>;
  /** Apps are being brought up (at start, or after the engine came back) (US-INST-11). */
  isReconciling(): boolean;
  onboarding: OnboardingService;
  sessions: SessionService;
  totp: TotpService;
  login: LoginService;
  drives: DriveProbe;
  /** CPU, memory and disk of this computer. */
  system: SystemProbe;
  /** CPU and memory in use right now (US-INST-05). */
  host: HostStats;
  /** Holds off sleep while apps run, when the setting is on (US-SYS-20). */
  keepAwake: KeepAwake;
  network: NetworkStorage;
  notifications: NotificationService;
}

/** Holds services once boot has created them; requests before then get DAEMON_STARTING. */
export class ServiceHolder {
  private value: Services | null = null;

  set(services: Services): void {
    this.value = services;
  }

  get current(): Services | null {
    return this.value;
  }
}
