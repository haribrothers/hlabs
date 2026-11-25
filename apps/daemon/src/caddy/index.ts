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
  /** The listener cloudflared sends public names to, while Cloudflare Tunnel is set up (D-178); else none. */
  public?: PublicListener | null;
}

/** A public app's route on the public listener (US-APP-27, 28). */
export interface PublicRoute {
  appId: string;
  /** `photos.example.com` */
  hostname: string;
  /** The app's port (12000–12999); its web service is on the loopback port 1000 above it (D-086). */
  port: number;
  /** hlabs's login (forward auth on the public address) or the app's own only. */
  access: 'hlabs' | 'ownLogin';
  /** The largest request it takes (manifest `public.maxBodyMb`). */
  maxBodyMb: number;
}

/**
 * Caddy's public listener (D-178): on 127.0.0.1 only, answering only public addresses (an unknown name is 404, never
 * the dashboard, the daemon or a private app), with cloudflared as the only trusted proxy.
 */
export interface PublicListener {
  port: number;
  /** Where its access log goes (Visits, US-APP-29): `<dataDir>/logs/public`, kept 7 days. */
  logDir: string;
  apps: PublicRoute[];
  /**
   * The dashboard's public name while it's public (US-SYS-45, D-182): served there as on the home server, with the
   * public hardening and `X-Hlabs-Via: public` on every request it passes on. Null (or absent) while it's private.
   */
  dashboard?: { hostname: string } | null;
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
