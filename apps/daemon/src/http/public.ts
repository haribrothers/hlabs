// hlabs's pages on a public app's address (D-178; 07 §7.10 control 3): Caddy's public listener sends
// `/.hlabs/sign-in` and `/.hlabs/sign-out` here, and asks `/auth/public-verify` before passing anything else to the
// app. Which address a request came to is the `X-Hlabs-Public-Host` header only the public listener sets (Caddy drops
// it everywhere else), and the visitor's address is X-Forwarded-For from Caddy (CF-Connecting-IP, D-178).
//
// Signing in is two steps, as on the dashboard: username and password, then the two-factor code (or a recovery code).
// Everyone needs two-factor on here ("Turn on two-factor login first"); a person the app isn't shared with gets the
// "no access" page. The form posts must come from `https://<public address>` (Origin). Success sets the host-only
// `__Host-hlabs_pub` cookie for a session that counts on this address only, listed and revocable with the person's
// other sessions. Failed sign-ins count per visitor address: more than 20 in 10 minutes and it's refused for an hour.
import { hlabsCodeOf, type HlabsCode } from '@hlabs/api';
import { appAccess, users, getUserSetting, type HlabsDb } from '@hlabs/db';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { appSummary } from '../apps/list';
import { clearedPublicSessionCookie, PUBLIC_SESSION_COOKIE, publicSessionCookie, readCookie } from '../auth/sessions';
import { publicRowForHost } from '../public/rows';
import type { ServiceHolder, Services } from '../services';
import { StaticPages, type PublicAppIcon, type PublicSignInPage, type StaticPageData } from './static-page';

export const PUBLIC_VERIFY_CACHE_MS = 10_000;

/** Every page hlabs answers with on a public address (D-178): typed, UTF-8, never cached, never framed. */
const PAGE_HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'content-security-policy':
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

const header = (req: FastifyRequest, name: string) => {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
};

/** The public address a request came to (set by Caddy's public listener only), lowercase, or null. */
export function publicHostOf(req: FastifyRequest): string | null {
  const host = header(req, 'x-hlabs-public-host');
  return host ? host.replace(/:\d+$/, '').toLowerCase() : null;
}

/** Where to go after signing in: a path on this address only, never another site or hlabs's own pages. */
export function publicNext(next: unknown): string {
  if (typeof next !== 'string' || next.length > 2048) return '/';
  if (!next.startsWith('/') || next.startsWith('//') || /[\\\r\n]/.test(next) || next.startsWith('/.hlabs/'))
    return '/';
  return next;
}

interface PublicApp {
  appId: string;
  host: string;
  access: 'hlabs' | 'ownLogin';
  appName: string;
  icon: PublicAppIcon;
}

/** The public app at a host, while it has a route (installed, not uninstalling). */
function publicApp(services: Services, host: string | null): PublicApp | null {
  if (!host) return null;
  const row = publicRowForHost(services.db, host);
  if (!row) return null;
  const app = services.apps.get(row.appId);
  if (!app || !services.apps.routes().some((r) => r.appId === app.id)) return null;
  const summary = appSummary(services.db, app);
  return {
    appId: app.id,
    host: row.hostname,
    access: row.access,
    appName: summary.name,
    icon: { gradient: summary.icon.gradient, fallback: summary.icon.fallback },
  };
}

/** Whether someone may open the app: admins always, members it's shared with. */
function mayOpen(db: HlabsDb, userId: string, role: 'admin' | 'member', appId: string): boolean {
  if (role === 'admin') return true;
  return Boolean(
    db
      .select({ appId: appAccess.appId })
      .from(appAccess)
      .where(and(eq(appAccess.appId, appId), eq(appAccess.userId, userId)))
      .get(),
  );
}

/** "You don't have access to this" on a public address (US-AUTH-19 style, with Sign out instead of Home). */
function noAccessPage(db: HlabsDb, app: PublicApp, userId: string): StaticPageData | null {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return null;
  const admin = db
    .select({ displayName: users.displayName })
    .from(users)
    .where(and(eq(users.role, 'admin'), isNull(users.disabledAt)))
    .orderBy(asc(users.createdAt))
    .get();
  return {
    kind: 'noAccess',
    homeUrl: `https://${app.host}/.hlabs/sign-out`,
    publicHost: app.host,
    appName: app.appName,
    adminName: admin?.displayName ?? null,
    username: user.username,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
    accent: getUserSetting(db, 'appearance', userId).accent,
  };
}

export type PublicVerdict =
  | { status: 200; username: string | null; role: 'admin' | 'member' | null }
  | { status: 302 }
  | { status: 401 | 404 }
  | { status: 403; page: StaticPageData | null };

/** Forward auth on public addresses (07 §7.10 control 3), cached 10 s per cookie and address like /auth/verify. */
export class PublicAuth {
  private readonly cache = new Map<string, { at: number; verdict: PublicVerdict }>();

  constructor(
    private readonly services: Services,
    private readonly now: () => number = Date.now,
  ) {
    services.bus.on(({ event }) => {
      if (
        event.type === 'session.revoked' ||
        event.type === 'access.changed' ||
        event.type === 'app.stateChanged' ||
        event.type === 'app.publicChanged'
      )
        this.cache.clear();
    });
  }

  verify(cookie: string | null, host: string | null): PublicVerdict {
    const key = `${cookie ?? ''}\n${host ?? ''}`;
    const now = this.now();
    const hit = this.cache.get(key);
    if (hit && now - hit.at < PUBLIC_VERIFY_CACHE_MS) return hit.verdict;
    const verdict = this.decide(cookie, host);
    this.cache.set(key, { at: now, verdict });
    if (this.cache.size > 10_000) this.cache.delete(this.cache.keys().next().value!);
    return verdict;
  }

  private decide(cookie: string | null, host: string | null): PublicVerdict {
    const { db } = this.services;
    const app = publicApp(this.services, host);
    if (!app) return { status: 404 };
    if (app.access === 'ownLogin') return { status: 200, username: null, role: null };
    const session = this.services.sessions.resolve(cookie, this.now(), { publicHost: app.host });
    if (!session) return { status: 302 };
    // Two-factor turned off since signing in: nobody gets in here without it.
    if (!this.services.totp.isEnabled(session.userId))
      return { status: 403, page: signInPage(app, { step: 'no2fa', next: '/' }) };
    if (!mayOpen(db, session.userId, session.role, app.appId))
      return { status: 403, page: noAccessPage(db, app, session.userId) };
    const user = db.select({ username: users.username }).from(users).where(eq(users.id, session.userId)).get();
    if (!user) return { status: 302 };
    return { status: 200, username: user.username, role: session.role };
  }
}

function signInPage(app: PublicApp, over: Partial<PublicSignInPage> & Pick<PublicSignInPage, 'step' | 'next'>) {
  return {
    kind: 'publicSignIn' as const,
    appName: app.appName,
    icon: app.icon,
    host: app.host,
    username: null,
    challenge: null,
    error: null,
    retryAfterSeconds: null,
    ...over,
  };
}

/** A public app's 502–504 (Caddy hands it here): "<App> isn't running", nothing about the computer. */
export function publicUnavailable(services: Services, req: FastifyRequest, reply: FastifyReply, pages: StaticPages) {
  const app = publicApp(services, publicHostOf(req));
  if (!app)
    return reply
      .code(404)
      .type('text/html; charset=utf-8')
      .headers(PAGE_HEADERS)
      .send(pages.render({ kind: 'notFound', homeUrl: '/' }));
  return reply
    .code(503)
    .type('text/html; charset=utf-8')
    .headers(PAGE_HEADERS)
    .send(pages.render({ kind: 'appNotRunning', appName: app.appName, icon: app.icon, host: app.host }));
}

const retryAfter = (err: unknown) => {
  const detail = (err as { cause?: { detail?: { retryAfterSeconds?: number } } }).cause?.detail;
  return detail?.retryAfterSeconds ?? 900;
};

export function registerPublicPages(app: FastifyInstance, holder: ServiceHolder, webFallbackDir: string): void {
  const pages = new StaticPages(webFallbackDir);
  let auth: PublicAuth | null = null;

  const send = (reply: FastifyReply, status: number, data: StaticPageData) =>
    reply.code(status).type('text/html; charset=utf-8').headers(PAGE_HEADERS).send(pages.render(data));
  const plain = (reply: FastifyReply, status: number, title: string) =>
    reply
      .code(status)
      .type('text/html; charset=utf-8')
      .headers(PAGE_HEADERS)
      .send(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1></body></html>`,
      );

  /** The services and the public app with hlabs's login at this address, or an answer already sent. */
  const resolve = (req: FastifyRequest, reply: FastifyReply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) {
      void plain(reply, 503, 'hlabs is starting');
      return null;
    }
    const target = publicApp(services, publicHostOf(req));
    if (!target || target.access !== 'hlabs') {
      void plain(reply, 404, 'Page not found');
      return null;
    }
    return { services, target };
  };

  /** Form posts must come from this public address itself (D-178). */
  const sameOrigin = (req: FastifyRequest, host: string) => header(req, 'origin') === `https://${host}`;

  app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string', bodyLimit: 16_384 },
      (_req, body, done) => done(null, Object.fromEntries(new URLSearchParams(body as string))),
    );

    scope.get('/.hlabs/sign-in', async (req, reply) => {
      const found = resolve(req, reply);
      if (!found) return reply;
      const { services, target } = found;
      const next = publicNext((req.query as Record<string, unknown>).next);
      const until = services.publicApps.limiter.refusedUntil(req.ip, Date.now());
      if (until)
        return send(
          reply,
          429,
          signInPage(target, { step: 'tooManyTries', next, retryAfterSeconds: secondsUntil(until) }),
        );
      // Signed in here already: on to the app.
      const cookie = readCookie(req.headers.cookie, PUBLIC_SESSION_COOKIE);
      if (services.sessions.resolve(cookie, Date.now(), { publicHost: target.host })) return reply.redirect(next, 303);
      return send(reply, 200, signInPage(target, { step: 'password', next }));
    });

    scope.post('/.hlabs/sign-in', async (req, reply) => {
      const found = resolve(req, reply);
      if (!found) return reply;
      const { services, target } = found;
      if (!sameOrigin(req, target.host)) return plain(reply, 403, 'Refused');
      const body = (req.body ?? {}) as Record<string, string | undefined>;
      const next = publicNext(body.next);
      const ip = req.ip;
      const userAgent = header(req, 'user-agent') ?? null;
      const limiter = services.publicApps.limiter;
      const refused = () => {
        const until = limiter.refusedUntil(ip, Date.now());
        return until
          ? send(reply, 429, signInPage(target, { step: 'tooManyTries', next, retryAfterSeconds: secondsUntil(until) }))
          : null;
      };
      const before = refused();
      if (before) return before;
      const failed = () => services.publicApps.signInFailed(target.appId, ip);

      // The second step: the code, or a recovery code.
      if (body.challenge) {
        const challengeId = body.challenge.slice(0, 64);
        const recoveryCode = body.recoveryCode?.trim();
        try {
          const result = recoveryCode
            ? await services.login.useRecoveryCode({
                challengeId,
                code: recoveryCode.slice(0, 64),
                ip,
                userAgent,
                publicHost: target.host,
              })
            : await services.login.verifyTotp({
                challengeId,
                code: (body.code ?? '').replace(/\s+/g, '').slice(0, 12),
                ip,
                userAgent,
                publicHost: target.host,
              });
          reply.header('set-cookie', publicSessionCookie(result.session.raw));
          return reply.redirect(next, 303);
        } catch (err) {
          const code: HlabsCode = hlabsCodeOf(err);
          if (code === 'AUTH_CHALLENGE_EXPIRED')
            return send(reply, 401, signInPage(target, { step: 'password', next, error: 'expired' }));
          if (code === 'AUTH_TOTP_INVALID' || code === 'AUTH_RECOVERY_INVALID' || code === 'AUTH_LOCKED') {
            failed();
            const over = refused();
            if (over) return over;
            if (code === 'AUTH_LOCKED')
              return send(
                reply,
                429,
                signInPage(target, { step: 'password', next, error: 'locked', retryAfterSeconds: retryAfter(err) }),
              );
            return send(
              reply,
              401,
              signInPage(target, { step: 'code', next, challenge: challengeId, error: 'invalid' }),
            );
          }
          throw err;
        }
      }

      // The first step: username and password.
      const username = (body.username ?? '').slice(0, 200);
      const password = (body.password ?? '').slice(0, 1024);
      if (!username || !password)
        return send(
          reply,
          401,
          signInPage(target, { step: 'password', next, username: username || null, error: 'invalid' }),
        );
      let result: Awaited<ReturnType<Services['login']['login']>>;
      try {
        result = await services.login.login({
          username,
          password,
          remember: false,
          ip,
          userAgent,
          publicHost: target.host,
        });
      } catch (err) {
        const code = hlabsCodeOf(err);
        if (code !== 'AUTH_INVALID_CREDENTIALS' && code !== 'AUTH_LOCKED') throw err;
        failed();
        const over = refused();
        if (over) return over;
        if (code === 'AUTH_LOCKED')
          return send(
            reply,
            429,
            signInPage(target, {
              step: 'password',
              next,
              username,
              error: 'locked',
              retryAfterSeconds: retryAfter(err),
            }),
          );
        return send(reply, 401, signInPage(target, { step: 'password', next, username, error: 'invalid' }));
      }
      if (result.kind === 'twoFactorRequired')
        return send(reply, 403, signInPage(target, { step: 'no2fa', next, username }));
      if (result.kind !== 'totp') return plain(reply, 403, 'Refused');
      const user = services.db.select().from(users).where(eq(users.id, result.userId)).get();
      if (!user || !mayOpen(services.db, user.id, user.role, target.appId)) {
        services.login.dropChallenge(result.challengeId);
        const page = user ? noAccessPage(services.db, target, user.id) : null;
        return page ? send(reply, 403, page) : plain(reply, 403, 'Refused');
      }
      return send(reply, 200, signInPage(target, { step: 'code', next, username, challenge: result.challengeId }));
    });

    scope.get('/.hlabs/sign-out', async (req, reply) => {
      const found = resolve(req, reply);
      if (!found) return reply;
      const { target } = found;
      return send(reply, 200, { kind: 'publicSignOut', appName: target.appName, icon: target.icon, host: target.host });
    });

    scope.post('/.hlabs/sign-out', async (req, reply) => {
      const found = resolve(req, reply);
      if (!found) return reply;
      const { services, target } = found;
      if (!sameOrigin(req, target.host)) return plain(reply, 403, 'Refused');
      const cookie = readCookie(req.headers.cookie, PUBLIC_SESSION_COOKIE);
      const session = services.sessions.resolve(cookie, Date.now(), { publicHost: target.host });
      if (session) services.sessions.revoke({ sessionId: session.sessionId });
      reply.header('set-cookie', clearedPublicSessionCookie());
      return reply.redirect('/.hlabs/sign-in', 303);
    });
  });

  // Caddy's forward auth on public addresses: 200 with the person, 302 to sign in for a page, 401 otherwise, 403 with a
  // page (no two-factor, no access), 404 for an address that isn't a public app.
  app.get('/auth/public-verify', { logLevel: 'warn' }, async (req, reply) => {
    const services = holder.current;
    reply.header('cache-control', 'no-store');
    if (!services?.readiness.isReady) return reply.code(503).send();
    auth ??= new PublicAuth(services);
    const verdict = auth.verify(readCookie(req.headers.cookie, PUBLIC_SESSION_COOKIE), publicHostOf(req));
    const navigation =
      (header(req, 'x-forwarded-method') ?? 'GET').toUpperCase() === 'GET' &&
      (header(req, 'accept') ?? '').includes('text/html');
    switch (verdict.status) {
      case 200:
        if (verdict.username) reply.header('x-hlabs-user', verdict.username).header('x-hlabs-role', verdict.role!);
        return reply.code(200).send();
      case 302: {
        if (!navigation) return reply.code(401).send();
        const next = publicNext(header(req, 'x-forwarded-uri') ?? '/');
        return reply.redirect(`/.hlabs/sign-in?next=${encodeURIComponent(next)}`, 302);
      }
      case 403:
        if (!navigation || !verdict.page) return reply.code(403).send();
        return send(reply, 403, verdict.page);
      default:
        return reply.code(verdict.status).send();
    }
  });
}

const secondsUntil = (until: number) => Math.max(1, Math.ceil((until - Date.now()) / 1000));

/** Whether the public listener is in front of this request (its 502–504s get the public page). */
export const isPublicRequest = (req: FastifyRequest) => publicHostOf(req) !== null;
