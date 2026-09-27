// The daemon's services, constructed once at boot and passed to every request context.
import type { HlabsDb } from '@hlabs/db';
import type { ProxyManager } from './caddy/index';
import type { DaemonConfig } from './config';
import type { EngineService } from './engine/service';
import type { EventBus } from './events/bus';
import type { JobRunner } from './jobs/runner';
import type { Logger } from './logger';
import type { MdnsPublisher } from './mdns/index';
import type { SecretStore } from './platform/secrets';
import type { Readiness } from './readiness';

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
