// Fastify on 127.0.0.1 only, with tRPC (+ SSE subscriptions) under /trpc and the plain HTTP routes.
import { appRouter } from '@hlabs/api';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyRequest } from 'fastify';
import type { DaemonConfig } from './config';
import { readCookie, SESSION_COOKIE } from './auth/sessions';
import { bearerToken, isLoopback, trayTokenSource, TrayTokens } from './auth/tray-token';
import { DaemonContext, type Identity } from './context';
import { dashboardOrigins } from './http/dashboard-origins';
import { registerDashboard } from './http/dashboard';
import { registerDevRoutes } from './http/dev';
import { registerHealthz } from './http/healthz';
import { registerAuthVerify } from './http/verify';
import { registerPublicPages } from './http/public';
import { registerAppAssets } from './http/app-assets';
import { registerAppearance } from './http/appearance';
import { registerAppLogs } from './http/app-logs';
import { registerDiagnostics } from './http/diagnostics';
import { registerFiles } from './http/files';
import { anonymousAdmin, countryOf, dashboardSession, publicHostFor, viaOf } from './http/via';
import type { Logger } from './logger';
import type { Readiness } from './readiness';
import { dispatcher } from './routers/index';
import type { ServiceHolder } from './services';

export interface ServerDeps {
  config: DaemonConfig;
  logger: Logger;
  readiness: Readiness;
  holder: ServiceHolder;
  /** The tray token check (US-INST-15); read from the keychain or token file by default. */
  trayTokens?: TrayTokens;
}

/**
 * The tray token (from loopback, never through Caddy) or the session cookie decides who is calling; without either,
 * the development-only anonymous admin (never from the public dashboard) or nobody. From the public dashboard only a
 * session made there counts, and from anywhere else never one (US-SYS-46, http/via.ts).
 */
async function identify(
  config: DaemonConfig,
  holder: ServiceHolder,
  trayTokens: TrayTokens,
  req: FastifyRequest,
): Promise<Identity> {
  const token = bearerToken(req.headers.authorization);
  if (token !== null) {
    // req.ip would follow X-Forwarded-For; the peer address is what matters here (US-INST-15).
    const proxied = Object.keys(req.headers).some((name) => name.startsWith('x-forwarded-'));
    if (!proxied && isLoopback(req.socket.remoteAddress) && (await trayTokens.verify(token))) return { kind: 'tray' };
    return { kind: 'trayRejected' };
  }
  const raw = readCookie(req.headers.cookie, SESSION_COOKIE);
  const services = holder.current;
  // While restarting or resetting (US-SYS-31, US-SYS-38) the session still counts, so calls answer DAEMON_STARTING
  // rather than sending people to log in; once the database is closed for good there's no session to read.
  if (raw && services) {
    let session: ReturnType<typeof services.sessions.resolve> = null;
    try {
      session = dashboardSession(services, req.headers, raw);
    } catch {
      // The daemon is stopping.
    }
    if (session) {
      return {
        kind: 'user',
        userId: session.userId,
        role: session.role,
        session: { id: session.sessionId, raw, remember: session.remember },
      };
    }
  }
  if (anonymousAdmin(config.devAnonymousAdmin, req.headers)) return { kind: 'user', userId: 'dev', role: 'admin' };
  return { kind: 'anonymous' };
}

const headerValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

export async function buildServer({
  config,
  logger,
  readiness,
  holder,
  ...deps
}: ServerDeps): Promise<FastifyInstance> {
  const trayTokens = deps.trayTokens ?? new TrayTokens(trayTokenSource(config));
  await trayTokens.load();
  const app = Fastify({
    loggerInstance: logger as FastifyBaseLogger,
    routerOptions: { maxParamLength: 5_000 },
    trustProxy: '127.0.0.1',
    // Closing ends open connections too (the dashboard's event streams), so shutdown never waits on them.
    forceCloseConnections: true,
  });

  registerHealthz(app, readiness, config.version);
  registerAuthVerify(app, holder, config.resources.webFallbackDir);
  registerPublicPages(app, holder, config.resources.webFallbackDir);
  registerAppAssets(app, holder, config.devAnonymousAdmin);
  registerAppLogs(app, holder, config.devAnonymousAdmin);
  registerDiagnostics(app, holder, config.devAnonymousAdmin);
  registerFiles(app, holder, config.devAnonymousAdmin, () =>
    dashboardOrigins(config.dashboardUrl, holder.current?.db ?? null),
  );
  registerAppearance(app, holder, () => dashboardOrigins(config.dashboardUrl, holder.current?.db ?? null));
  if (config.dev) registerDevRoutes(app, holder);
  registerDashboard(app, config.resources.webDir);

  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    // Per-request logs only in development.
    logLevel: config.dev ? 'info' : 'warn',
    trpcOptions: {
      router: appRouter,
      createContext: async ({ req, res }) => {
        const db = holder.current?.db ?? null;
        const via = viaOf(req.headers, db);
        return new DaemonContext(holder, dispatcher, await identify(config, holder, trayTokens, req), {
          ip: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
          setupToken: headerValue(req.headers['x-hlabs-setup']),
          csrfToken: headerValue(req.headers['x-hlabs-csrf']),
          origin: headerValue(req.headers.origin),
          host: headerValue(req.headers['x-forwarded-host']) ?? headerValue(req.headers.host),
          allowedOrigins: dashboardOrigins(config.dashboardUrl, db),
          via,
          publicHost: publicHostFor(req.headers, db),
          country: via === 'public' ? countryOf(req.headers) : null,
          setCookie: (cookie) => void res.header('set-cookie', cookie),
        });
      },
      onError: ({ path, error }) => {
        if (error.code === 'INTERNAL_SERVER_ERROR') logger.error({ err: error, path }, 'procedure failed');
      },
    } satisfies FastifyTRPCPluginOptions<typeof appRouter>['trpcOptions'],
  });

  return app;
}
