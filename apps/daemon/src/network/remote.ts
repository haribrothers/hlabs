// Remote access with Tailscale (US-SYS-02…04, US-ONB-17): connecting, publishing hlabs with Tailscale Serve, and
// saying where it stands. hlabs uses the Tailscale already on this computer (D-007), keeps the computer's own name
// (D-102), changes only the Serve entries it created and asks before taking a port that's served already (D-103),
// and never turns on Funnel.
import { hlabsError } from '@hlabs/api';
import { auditLog, getSetting, setSetting, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import type { AppRoute } from '../apps/service';
import type { SessionService } from '../auth/sessions';
import type { Logger } from '../logger';
import { TailscaleError, type ServeConfig, type TailscaleClient, type TailscaleState } from '../tailscale/types';
import { tailnetDashboardUrl } from './domains';

/** A log-in that isn't finished by then is given up (US-SYS-02). */
export const LOGIN_TIMEOUT_MS = 10 * 60_000;
/** The dashboard's tailnet port when 443 is served by something else already (D-103). */
export const ALTERNATE_DASHBOARD_PORT = 8443;

export type RemoteState =
  'off' | 'not_installed' | 'stopped' | 'waiting' | 'timed_out' | 'connected' | 'logged_out' | 'https_disabled';

export interface RemoteStatus {
  mode: 'off' | 'tailscale' | 'subnetRouter';
  state: RemoteState;
  tailnet: string | null;
  nodeName: string | null;
  /** The dashboard on the tailnet, while connected. */
  url: string | null;
  loginUrl: string | null;
  keyExpiry: number | null;
}

export type ConnectResult =
  | { state: 'not_installed' | 'stopped' }
  | { state: 'needs_login'; loginUrl: string | null }
  | { state: 'confirm'; tailnet: string; nodeName: string }
  | { state: 'connected'; url: string };

interface Who {
  userId: string;
  ip: string | null;
}

export interface RemoteDeps {
  db: HlabsDb;
  tailscale: TailscaleClient;
  sessions: SessionService;
  logger: Logger;
  /** Where the dashboard is served on this computer (`127.0.0.1:7474`). */
  dashboardUpstream: string;
  /** The routed apps, each with its port (12000–12999). */
  routes: () => AppRoute[];
  now?: () => number;
}

/** Tailscale's addresses (100.64.0.0/10, fd7a:115c:a1e0::/48): sessions that came over the tailnet. */
export function isTailnetIp(ip: string | null): boolean {
  if (!ip) return false;
  const v4 = /^(?:::ffff:)?(\d+)\.(\d+)\.\d+\.\d+$/.exec(ip);
  if (v4) return Number(v4[1]) === 100 && Number(v4[2]) >= 64 && Number(v4[2]) <= 127;
  return ip.toLowerCase().startsWith('fd7a:115c:a1e0:');
}

/** What hlabs serves: the dashboard on `dashboardPort`, each app on its own port through Caddy (forward auth). */
export function desiredServe(host: string, dashboardPort: number, upstream: string, routes: readonly AppRoute[]) {
  const entries = new Map<number, string>([[dashboardPort, `http://${upstream}`]]);
  for (const r of routes) entries.set(r.port, `https+insecure://127.0.0.1:${r.port}`);
  return [...entries].map(([port, proxy]) => ({ port, host: `${host}:${port}`, proxy }));
}

/** A port served by something hlabs didn't create (D-103). */
export function foreignPorts(config: ServeConfig, owned: readonly number[], wanted: readonly number[]): number[] {
  const served = new Set(Object.keys(config.TCP ?? {}).map(Number));
  return wanted.filter((p) => served.has(p) && !owned.includes(p));
}

/** The config with hlabs's old entries swapped for `entries`; everyone else's (and Funnel) left as they were. */
export function mergeServe(
  config: ServeConfig,
  owned: readonly number[],
  entries: ReadonlyArray<{ port: number; host: string; proxy: string }>,
): ServeConfig {
  const tcp = { ...(config.TCP ?? {}) };
  const web = { ...(config.Web ?? {}) };
  for (const port of owned) {
    delete tcp[String(port)];
    for (const key of Object.keys(web)) if (key.endsWith(`:${port}`)) delete web[key];
  }
  for (const e of entries) {
    tcp[String(e.port)] = { HTTPS: true };
    web[e.host] = { Handlers: { '/': { Proxy: e.proxy } } };
  }
  const next: ServeConfig = { ...config, TCP: tcp, Web: web };
  if (!Object.keys(tcp).length) delete next.TCP;
  if (!Object.keys(web).length) delete next.Web;
  return next;
}

export class RemoteService {
  /** The log-in URL of a log-in in progress, kept until Tailscale is running. */
  private loginUrl: string | null = null;

  constructor(private readonly deps: RemoteDeps) {}

  private now() {
    return (this.deps.now ?? Date.now)();
  }

  private settings() {
    return getSetting(this.deps.db, 'remote');
  }

  private save(change: Partial<ReturnType<RemoteService['settings']>>) {
    setSetting(this.deps.db, 'remote', { ...this.settings(), ...change });
  }

  private audit(who: Who | null, action: string, detail: Record<string, unknown> | null) {
    this.deps.db
      .insert(auditLog)
      .values({
        id: ulid(),
        at: this.now(),
        userId: who?.userId ?? null,
        action,
        target: 'tailscale',
        detailJson: detail,
        ip: who?.ip ?? null,
      })
      .run();
  }

  private async state(): Promise<TailscaleState> {
    try {
      return await this.deps.tailscale.state();
    } catch (err) {
      if (err instanceof TailscaleError && err.kind === 'permission') throw hlabsError('TAILSCALE_PERMISSION_DENIED');
      this.deps.logger.warn({ err }, 'Tailscale LocalAPI failed');
      return { kind: 'stopped' };
    }
  }

  /**
   * Publishes the dashboard and every app with Serve. Refuses a port something else serves (TAILSCALE_SERVE_CONFLICT)
   * and a tailnet without HTTPS certificates (TAILSCALE_HTTPS_DISABLED).
   */
  private async publish(running: Extract<TailscaleState, { kind: 'running' }>, dashboardPort: number) {
    if (!running.httpsEnabled) throw hlabsError('TAILSCALE_HTTPS_DISABLED');
    const host = `${running.nodeName}.${running.tailnet}`;
    const entries = desiredServe(host, dashboardPort, this.deps.dashboardUpstream, this.deps.routes());
    const owned = this.settings().serve;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { config, etag } = await this.deps.tailscale.serveConfig();
      const clash = foreignPorts(
        config,
        owned,
        entries.map((e) => e.port),
      );
      if (clash.length) throw hlabsError('TAILSCALE_SERVE_CONFLICT', undefined, { port: clash[0] });
      try {
        await this.deps.tailscale.setServeConfig(mergeServe(config, owned, entries), etag);
      } catch (err) {
        if (err instanceof TailscaleError && err.kind === 'conflict') continue;
        if (err instanceof TailscaleError && err.kind === 'permission') throw hlabsError('TAILSCALE_PERMISSION_DENIED');
        throw err;
      }
      this.save({
        mode: 'tailscale',
        state: 'connected',
        tailnetName: running.tailnet,
        nodeName: running.nodeName,
        dashboardPort,
        serve: entries.map((e) => e.port),
        connectStartedAt: null,
      });
      this.loginUrl = null;
      return;
    }
    throw hlabsError('INTERNAL', 'Serve config kept changing');
  }

  /**
   * Connect (US-SYS-02, US-ONB-17). Not installed or not running: says so. Signed out: starts a log-in that names this
   * computer after the server (D-102) and gives its URL. Already signed in: asks to confirm the tailnet first, unless
   * hlabs started this log-in. Then publishes.
   */
  async connect(input: { confirmTailnet?: boolean; dashboardPort?: number }, who: Who): Promise<ConnectResult> {
    const ts = await this.state();
    if (ts.kind === 'not_installed' || ts.kind === 'stopped') return { state: ts.kind };
    const dashboardPort = input.dashboardPort ?? this.settings().dashboardPort;
    if (ts.kind === 'needs_login') {
      try {
        await this.deps.tailscale.login({ hostname: getSetting(this.deps.db, 'hostname') });
      } catch (err) {
        if (err instanceof TailscaleError && err.kind === 'permission') throw hlabsError('TAILSCALE_PERMISSION_DENIED');
        throw err;
      }
      this.save({ mode: 'tailscale', state: 'connecting', connectStartedAt: this.now(), dashboardPort });
      this.audit(who, 'network.remote.connect', { login: true });
      const after = await this.state();
      if (after.kind === 'running') {
        await this.publish(after, dashboardPort);
        return { state: 'connected', url: tailnetDashboardUrl(this.deps.db)! };
      }
      this.loginUrl = after.kind === 'needs_login' ? after.authUrl : null;
      return { state: 'needs_login', loginUrl: this.loginUrl };
    }
    // Already signed in: never publish on someone's tailnet without them saying so (it may be a work one).
    const startedHere = this.settings().state === 'connecting';
    if (!input.confirmTailnet && !startedHere) return { state: 'confirm', tailnet: ts.tailnet, nodeName: ts.nodeName };
    await this.publish(ts, dashboardPort);
    this.audit(who, 'network.remote.connect', { tailnet: ts.tailnet, dashboardPort });
    return { state: 'connected', url: tailnetDashboardUrl(this.deps.db)! };
  }

  private reconciling: Promise<void> = Promise.resolve();

  /**
   * Keeps the tailnet in step with the apps (US-SYS-04): while connected, an installed app gets its Serve entry and an
   * uninstalled one loses it. Runs one at a time; a problem is logged and tried again on the next change.
   */
  reconcile(): Promise<void> {
    const next = this.reconciling.then(async () => {
      const saved = this.settings();
      if (saved.mode !== 'tailscale' || saved.state !== 'connected') return;
      try {
        const ts = await this.state();
        if (ts.kind === 'running') await this.publish(ts, saved.dashboardPort);
      } catch (err) {
        this.deps.logger.warn({ err }, "couldn't update the apps on the tailnet");
      }
    });
    this.reconciling = next;
    return next;
  }

  /** Rewrites the Serve config without hlabs's entries; everything else stays (D-103). */
  private async unpublish() {
    const owned = this.settings().serve;
    if (!owned.length) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      let current;
      try {
        current = await this.deps.tailscale.serveConfig();
      } catch (err) {
        if (err instanceof TailscaleError && err.kind === 'permission') throw hlabsError('TAILSCALE_PERMISSION_DENIED');
        throw hlabsError('TAILSCALE_NOT_RUNNING');
      }
      try {
        await this.deps.tailscale.setServeConfig(mergeServe(current.config, owned, []), current.etag);
        return;
      } catch (err) {
        if (err instanceof TailscaleError && err.kind === 'conflict') continue;
        if (err instanceof TailscaleError && err.kind === 'permission') throw hlabsError('TAILSCALE_PERMISSION_DENIED');
        throw hlabsError('TAILSCALE_NOT_RUNNING');
      }
    }
    throw hlabsError('INTERNAL', 'Serve config kept changing');
  }

  /**
   * Disconnect (US-SYS-03): hlabs's Serve entries go (nobody else's), sessions that came over the tailnet end, and
   * Tailscale's own log-in is left alone.
   */
  async disconnect(who: Who) {
    await this.unpublish();
    this.save({
      mode: 'off',
      state: 'off',
      tailnetName: null,
      nodeName: null,
      serve: [],
      dashboardPort: 443,
      connectStartedAt: null,
    });
    this.loginUrl = null;
    const ended = this.deps.sessions.revokeWhere((s) => isTailnetIp(s.ip));
    this.audit(who, 'network.remote.disconnect', { sessionsEnded: ended.length });
  }

  /** Remote access as saved, without asking Tailscale. */
  saved(): RemoteStatus {
    const s = this.settings();
    const connected = s.mode === 'tailscale' && s.state === 'connected';
    return {
      mode: s.mode,
      state: connected ? 'connected' : 'off',
      tailnet: s.tailnetName,
      nodeName: s.nodeName,
      url: connected ? tailnetDashboardUrl(this.deps.db) : null,
      loginUrl: null,
      keyExpiry: null,
    };
  }

  /**
   * Where remote access stands. A log-in in progress finishes here: once Tailscale runs, hlabs publishes (the
   * dashboard asks every 2 s while it waits); after 10 minutes it's given up.
   */
  async status(): Promise<RemoteStatus> {
    const saved = this.settings();
    if (saved.mode === 'subnetRouter') {
      return {
        mode: saved.mode,
        state: 'off',
        tailnet: null,
        nodeName: null,
        url: null,
        loginUrl: null,
        keyExpiry: null,
      };
    }
    const ts = await this.state();
    let state: RemoteState;
    if (saved.state === 'connecting') {
      if (ts.kind === 'running') {
        try {
          await this.publish(ts, saved.dashboardPort);
          state = 'connected';
        } catch (err) {
          this.deps.logger.warn({ err }, 'publishing with Tailscale Serve failed');
          state = ts.httpsEnabled ? 'waiting' : 'https_disabled';
        }
      } else if (saved.connectStartedAt !== null && this.now() - saved.connectStartedAt > LOGIN_TIMEOUT_MS) {
        this.save({ mode: 'off', state: 'off', connectStartedAt: null });
        this.loginUrl = null;
        state = 'timed_out';
      } else state = ts.kind === 'needs_login' ? 'waiting' : ts.kind;
    } else if (saved.state === 'connected') {
      state = ts.kind === 'running' ? 'connected' : ts.kind === 'needs_login' ? 'logged_out' : ts.kind;
    } else {
      state = ts.kind === 'not_installed' || ts.kind === 'stopped' ? ts.kind : 'off';
    }
    const now = this.settings();
    return {
      mode: now.mode,
      state,
      tailnet: ts.kind === 'running' ? ts.tailnet : now.tailnetName,
      nodeName: ts.kind === 'running' ? ts.nodeName : now.nodeName,
      url: state === 'connected' ? tailnetDashboardUrl(this.deps.db) : null,
      loginUrl: state === 'waiting' ? this.loginUrl : null,
      keyExpiry: ts.kind === 'running' ? ts.keyExpiry : null,
    };
  }
}
