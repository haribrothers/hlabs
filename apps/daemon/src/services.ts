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
import type { SystemProbe } from './platform/system';
import type { NotificationService } from './notifications/service';
import type { NetworkStorage } from './storage/network';
import type { SecretStore } from './platform/secrets';
import type { Readiness } from './readiness';
import type { CatalogService } from './store/catalog';
import type { StoreService } from './store/service';
import type { InstallService } from './apps/install';
import type { AppService } from './apps/service';
import type { NetworkService } from './network/service';

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
  apps: AppService;
  /** Caddy and mDNS names (02 §2.6). */
  routing: NetworkService;
  /** Settles when the start-up reconcile has finished (tests). */
  reconciled: Promise<void>;
  onboarding: OnboardingService;
  sessions: SessionService;
  totp: TotpService;
  login: LoginService;
  drives: DriveProbe;
  /** CPU, memory and disk of this computer. */
  system: SystemProbe;
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
