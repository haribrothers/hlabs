// Caddy is managed through its admin API (D-006): NetworkService builds the whole state from the database and the
// proxy applies it. `pnpm dev` and tests run without Caddy (NoopProxyManager); production and `pnpm dev:full` use
// CaddyProxy.
import type { AppRoute } from '../apps/service';

export interface ProxyState {
  /** The dashboard name: `hlabs` → `hlabs.local`, apps at `<app>.hlabs.local`. */
  hostname: string;
  ports: { https: number; http: number };
  /** Before onboarding finishes, port 80 serves the dashboard too (07 §7.1, D-013). */
  onboardingComplete: boolean;
  /** Where dashboard pages go (the daemon; Vite under `pnpm dev:full`). */
  dashboardUpstream: string;
  /** The daemon itself, for forward auth. */
  daemon: string;
  /** The dashboard's tailnet name (`hlabs.<tailnet>.ts.net`) when remote access is on, for app framing. */
  tailnetHost: string | null;
  /**
   * This computer's addresses on the home network: the dashboard answers on `https://<LAN IP>` too, with a
   * certificate for each (the fallback address, US-SYS-01; through a subnet router, US-SYS-41).
   */
  lanAddresses?: string[];
  apps: AppRoute[];
}

/** Caddy couldn't start because another program holds one of hlabs's web ports (US-SYS-42). */
export interface ProxyProblem {
  port: number;
}

export interface ProxyManager {
  /** Starts Caddy on first use, then replaces its config. */
  apply(state: ProxyState): Promise<void>;
  stop(): Promise<void>;
  /** Why Caddy isn't serving, when it's a port another program holds; null while it serves (US-SYS-42). */
  problem(): ProxyProblem | null;
}

export class NoopProxyManager implements ProxyManager {
  last: ProxyState | null = null;
  async apply(state: ProxyState) {
    this.last = state;
  }
  async stop() {}
  problem() {
    return null;
  }
}
