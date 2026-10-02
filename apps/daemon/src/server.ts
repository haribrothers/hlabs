// Fastify on 127.0.0.1 only, with tRPC (+ SSE subscriptions) under /trpc and the plain HTTP routes.
import { appRouter } from '@hlabs/api';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyRequest } from 'fastify';
import type { DaemonConfig } from './config';
import { readCookie, SESSION_COOKIE } from './auth/sessions';
import { bearerToken, isLoopback, trayTokenSource, TrayTokens } from './auth/tray-token';
import { DaemonContext, type Identity } from './context';
import { dashboardOrigins } from './http/dashboard-origins';
import { registerDevRoutes } from './http/dev';
import { registerHealthz } from './http/healthz';
import { registerAuthVerify } from './http/verify';
import { registerAppAssets } from './http/app-assets';
import { registerAppLogs } from './http/app-logs';
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
 * the development-only anonymous admin or nobody.
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
  if (raw && services?.readiness.isReady) {
    const session = services.sessions.resolve(raw);
    if (session) {
      return {
        kind: 'user',
        userId: session.userId,
        role: session.role,
        session: { id: session.sessionId, raw, remember: session.remember },
      };
    }
  }
  if (config.devAnonymousAdmin) return { kind: 'user', userId: 'dev', role: 'admin' };
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
  registerAppAssets(app, holder, config.devAnonymousAdmin);
  registerAppLogs(app, holder, config.devAnonymousAdmin);
  if (config.dev) registerDevRoutes(app, holder);

  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    // Per-request logs only in development.
    logLevel: config.dev ? 'info' : 'warn',
    trpcOptions: {
      router: appRouter,
      createContext: async ({ req, res }) =>
        new DaemonContext(holder, dispatcher, await identify(config, holder, trayTokens, req), {
          ip: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
          setupToken: headerValue(req.headers['x-hlabs-setup']),
          csrfToken: headerValue(req.headers['x-hlabs-csrf']),
          origin: headerValue(req.headers.origin),
          host: headerValue(req.headers['x-forwarded-host']) ?? headerValue(req.headers.host),
          allowedOrigins: dashboardOrigins(config.dashboardUrl, holder.current?.db ?? null),
          setCookie: (cookie) => void res.header('set-cookie', cookie),
        }),
      onError: ({ path, error }) => {
        if (error.code === 'INTERNAL_SERVER_ERROR') logger.error({ err: error, path }, 'procedure failed');
      },
    } satisfies FastifyTRPCPluginOptions<typeof appRouter>['trpcOptions'],
  });

  return app;
}
