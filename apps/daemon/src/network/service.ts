// NetworkService owns how hlabs is reached (02 §2.6): it builds Caddy's state and the mDNS names from the database and
// applies them at start, whenever an app's route appears or goes, and when onboarding finishes. A failure is logged
// and tried again at the next change; the daemon keeps running without it.
import { getSetting, type HlabsDb } from '@hlabs/db';
import type { AppRoute } from '../apps/service';
import type { ProxyManager, ProxyState } from '../caddy/index';
import type { EventBus } from '../events/bus';
import type { Logger } from '../logger';
import type { MdnsPublisher } from '../mdns/index';
import { lanAddresses } from '../mdns/publisher';
import { homeDomains, tailnetHost } from './domains';

export interface NetworkServiceDeps {
  db: HlabsDb;
  proxy: ProxyManager;
  mdns: MdnsPublisher;
  logger: Logger;
  routes: () => AppRoute[];
  dashboardUpstream: string;
  /** The daemon's loopback address, for forward auth. */
  daemon: string;
  /** This computer's LAN IPv4 addresses, best first. */
  lanAddresses?: () => string[];
}

export class NetworkService {
  private applied: string | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly deps: NetworkServiceDeps) {}

  state(): ProxyState {
    const { db } = this.deps;
    return {
      hostname: getSetting(db, 'hostname'),
      ports: getSetting(db, 'network').ports,
      onboardingComplete: getSetting(db, 'onboarding').completedAt !== null,
      dashboardUpstream: this.deps.dashboardUpstream,
      daemon: this.deps.daemon,
      tailnetHost: tailnetHost(db),
      lanAddresses: (this.deps.lanAddresses ?? lanAddresses)(),
      apps: this.deps.routes(),
    };
  }

  /** mDNS names for a state: the dashboard and every routed app. */
  static names(state: ProxyState): string[] {
    const domain = `${state.hostname}.local`;
    return [domain, ...state.apps.map((a) => `${a.hostname}.${domain}`)];
  }

  /** Applies the current state if it changed (or always, with `force`). Calls run one after another. */
  sync(options: { force?: boolean } = {}): Promise<void> {
    const next = this.queue.then(() => this.syncNow(options.force ?? false));
    this.queue = next;
    return next;
  }

  /**
   * How hlabs is reached on the home network (US-SYS-01): its `.local` and `.home.arpa` addresses (D-105), whether
   * the `.local` name is published, and the LAN addresses to use when it isn't.
   */
  homeNetwork() {
    const { db } = this.deps;
    const hostname = getSetting(db, 'hostname');
    const ports = getSetting(db, 'network').ports;
    const [local, dns] = homeDomains(hostname);
    const withPort = (host: string) => `https://${host}${ports.https === 443 ? '' : `:${ports.https}`}`;
    const lan = (this.deps.lanAddresses ?? lanAddresses)();
    const published = this.isPublished(local);
    return {
      hostname,
      localAddress: withPort(local),
      dnsAddress: withPort(dns),
      published,
      lanAddresses: lan,
      fallbackAddress: published || !lan[0] ? null : withPort(lan[0]),
    };
  }

  /** Whether a name (`immich.hlabs.local`) is published on the LAN; apps whose names aren't use their own port. */
  isPublished(name: string): boolean {
    return this.deps.mdns.isPublished(name);
  }

  /** Follows app state changes: a route appears when an app is installed and goes when it's uninstalled. */
  watch(bus: EventBus): void {
    bus.on(({ event }) => {
      if (event.type === 'app.stateChanged') void this.sync();
    });
  }

  private async syncNow(force: boolean): Promise<void> {
    const state = this.state();
    const key = JSON.stringify(state);
    if (!force && key === this.applied) return;
    try {
      await this.deps.proxy.apply(state);
      await this.deps.mdns.sync(NetworkService.names(state));
      this.applied = key;
    } catch (err) {
      this.deps.logger.error({ err }, 'could not apply the network config');
    }
  }
}
