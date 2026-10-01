// GET /auth/verify (US-AUTH-17): Caddy's forward auth for app hostnames (02 §2.6). It reads the session cookie and
// the X-Forwarded-* headers Caddy sets and answers:
//   200 + X-Hlabs-User / X-Hlabs-Role: signed in and allowed; Caddy passes the request on to the app.
//   302 to the dashboard's log in (or two-factor setup) for a browser navigation; 401 with no body otherwise.
//   403 for a member the app isn't shared with, with the "no access" page for a browser (US-AUTH-19); 404 with
//   the 404 page for a host that is no installed app.
// Answers are cached for 10 s per cookie and host, and the cache is cleared whenever a session is revoked, access
// changes or an app's state changes, so it stays under 5 ms at 100 requests a second.
import { appAccess, apps, getSetting, getUserSetting, users, type HlabsDb } from '@hlabs/db';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { catalogManifest } from '../apps/list';
import { APP_PORT_MAX, APP_PORT_MIN } from '../apps/ports';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { readCookie, SESSION_COOKIE } from '../auth/sessions';
import type { ServiceHolder, Services } from '../services';
import { StaticPages, type NoAccessPage } from './static-page';

export const VERIFY_CACHE_MS = 10_000;

/** States in which an app answers on its hostname (the same as having a Caddy route). */
const LIVE = new Set(['starting', 'running', 'stopping', 'stopped', 'restarting', 'updating', 'rolling_back', 'error']);

export type Verdict =
  | { status: 200; username: string; role: 'admin' | 'member' }
  | { status: 302; location: string }
  /** A member the app isn't shared with (US-AUTH-19): what the "no access" page says. */
  | { status: 403; page: Omit<NoAccessPage, 'kind' | 'homeUrl'> }
  | { status: 401 | 404 };

interface Request {
  cookie: string | null;
  /** X-Forwarded-Host, with its port if any. */
  host: string;
  method: string;
  uri: string;
  accept: string;
}

const header = (req: FastifyRequest, name: string) => {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
};

export class ForwardAuth {
  private readonly cache = new Map<string, { at: number; verdict: Verdict }>();

  constructor(
    private readonly services: Pick<Services, 'db' | 'sessions' | 'totp' | 'bus'>,
    private readonly now: () => number = Date.now,
  ) {
    services.bus.on(({ event }) => {
      if (event.type === 'session.revoked' || event.type === 'access.changed' || event.type === 'app.stateChanged') {
        this.cache.clear();
      }
    });
  }

  verify(req: Request): Verdict {
    const navigation = req.method === 'GET' && req.accept.includes('text/html');
    const key = `${req.cookie ?? ''}\n${req.host.toLowerCase()}`;
    const hit = this.cache.get(key);
    const now = this.now();
    let verdict: Verdict;
    if (hit && now - hit.at < VERIFY_CACHE_MS) verdict = hit.verdict;
    else {
      verdict = this.decide(req.cookie, req.host);
      this.cache.set(key, { at: now, verdict });
      if (this.cache.size > 10_000) this.cache.delete(this.cache.keys().next().value!);
    }
    // Redirects are for browsers finding their way; anything else gets 401 so apps don't follow HTML.
    if (verdict.status === 302) {
      if (!navigation) return { status: 401 };
      const back = `https://${req.host}${req.uri.startsWith('/') ? req.uri : '/'}`;
      return { status: 302, location: `${verdict.location}?next=${encodeURIComponent(back)}` };
    }
    return verdict;
  }

  private decide(cookie: string | null, forwardedHost: string): Verdict {
    const { db } = this.services;
    const app = appForHost(db, forwardedHost);
    if (!app) return { status: 404 };
    const dashboard = dashboardOrigin(db, forwardedHost);
    const session = this.services.sessions.resolve(cookie, this.now());
    if (!session) return { status: 302, location: `${dashboard}/login` };
    if (getSetting(db, 'people').requireTotp && !this.services.totp.isEnabled(session.userId)) {
      return { status: 302, location: `${dashboard}/settings/account/two-factor` };
    }
    const user = db
      .select({ username: users.username, displayName: users.displayName, avatarColor: users.avatarColor })
      .from(users)
      .where(eq(users.id, session.userId))
      .get();
    if (!user) return { status: 302, location: `${dashboard}/login` };
    if (session.role !== 'admin') {
      const shared = db
        .select({ appId: appAccess.appId })
        .from(appAccess)
        .where(and(eq(appAccess.appId, app.id), eq(appAccess.userId, session.userId)))
        .get();
      if (!shared) {
        const admin = db
          .select({ displayName: users.displayName })
          .from(users)
          .where(and(eq(users.role, 'admin'), isNull(users.disabledAt)))
          .orderBy(asc(users.createdAt))
          .get();
        return {
          status: 403,
          page: {
            appName: catalogManifest(db, app).name ?? app.id,
            adminName: admin?.displayName ?? null,
            username: user.username,
            displayName: user.displayName,
            avatarColor: user.avatarColor,
            accent: getUserSetting(db, 'appearance', session.userId).accent,
          },
        };
      }
    }
    return { status: 200, username: user.username, role: session.role };
  }
}

/** An app's own port (12000–12999, D-086) in a forwarded host, or null. */
function appPortIn(forwardedHost: string): number | null {
  const port = Number(/:(\d+)$/.exec(forwardedHost)?.[1]);
  return port >= APP_PORT_MIN && port <= APP_PORT_MAX ? port : null;
}

/**
 * The installed app a forwarded host names, in a state that has a route: `<app>.<hostname>.local`, or any name on
 * the app's own port (`hlabs.local:12003` when its name isn't published, US-APP-05; its tailnet address).
 */
export function appForHost(db: HlabsDb, forwardedHost: string) {
  const host = forwardedHost.replace(/:\d+$/, '').toLowerCase();
  const suffix = `.${getSetting(db, 'hostname')}.local`;
  const port = appPortIn(forwardedHost);
  const app = host.endsWith(suffix)
    ? db
        .select()
        .from(apps)
        .where(eq(apps.hostname, host.slice(0, -suffix.length)))
        .get()
    : port !== null
      ? db.select().from(apps).where(eq(apps.portFallback, port)).get()
      : undefined;
  return app && LIVE.has(app.state) ? app : null;
}

/** The dashboard on the port the app was reached on (8443 when 443 was taken, D-016), its own port from an app's. */
export function dashboardOrigin(db: HlabsDb, forwardedHost: string): string {
  const reached = /:(\d+)$/.exec(forwardedHost)?.[1];
  const port = appPortIn(forwardedHost) !== null ? String(getSetting(db, 'network').ports.https) : reached;
  return `https://${getSetting(db, 'hostname')}.local${port && port !== '443' ? `:${port}` : ''}`;
}

export function registerAuthVerify(app: FastifyInstance, holder: ServiceHolder, webFallbackDir: string): void {
  let auth: ForwardAuth | null = null;
  const pages = new StaticPages(webFallbackDir);
  const started = new WeakMap<FastifyRequest, number>();
  const options = {
    logLevel: 'warn' as const,
    onRequest: async (req: FastifyRequest) => void started.set(req, performance.now()),
    // How long the answer took in the daemon, without the network (the 5 ms p95 target, US-AUTH-17).
    onSend: async (req: FastifyRequest, reply: FastifyReply, payload: unknown) => {
      reply.header('server-timing', `verify;dur=${(performance.now() - (started.get(req) ?? 0)).toFixed(2)}`);
      return payload;
    },
  };
  app.get('/auth/verify', options, async (req: FastifyRequest, reply: FastifyReply) => {
    const services = holder.current;
    reply.header('cache-control', 'no-store');
    if (!services) return reply.code(503).send();
    auth ??= new ForwardAuth(services);
    const host = header(req, 'x-forwarded-host') ?? '';
    const verdict = auth.verify({
      cookie: readCookie(req.headers.cookie, SESSION_COOKIE),
      host,
      method: (header(req, 'x-forwarded-method') ?? 'GET').toUpperCase(),
      uri: header(req, 'x-forwarded-uri') ?? '/',
      accept: header(req, 'accept') ?? '',
    });
    switch (verdict.status) {
      case 200:
        return reply.header('x-hlabs-user', verdict.username).header('x-hlabs-role', verdict.role).code(200).send();
      case 302:
        return reply.redirect(verdict.location, 302);
      case 403:
      case 404: {
        // Browsers get a page; anything else just the status.
        const navigation = (header(req, 'accept') ?? '').includes('text/html');
        if (!navigation) return reply.code(verdict.status).send();
        const homeUrl = `${dashboardOrigin(services.db, host)}/`;
        const html = pages.render(
          verdict.status === 403 ? { kind: 'noAccess', homeUrl, ...verdict.page } : { kind: 'notFound', homeUrl },
        );
        return reply.code(verdict.status).type('text/html; charset=utf-8').send(html);
      }
      default:
        return reply.code(verdict.status).send();
    }
  });
}
