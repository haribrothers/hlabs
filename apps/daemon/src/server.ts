// Fastify on 127.0.0.1 only, with tRPC (+ SSE subscriptions) under /trpc and the plain HTTP routes.
import { appRouter } from '@hlabs/api';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyRequest } from 'fastify';
import type { DaemonConfig } from './config';
import { readCookie, SESSION_COOKIE } from './auth/sessions';
import { DaemonContext, type Identity } from './context';
import { registerDevRoutes } from './http/dev';
import { registerHealthz } from './http/healthz';
import type { Logger } from './logger';
import type { Readiness } from './readiness';
import { dispatcher } from './routers/index';
import type { ServiceHolder } from './services';

export interface ServerDeps {
  config: DaemonConfig;
  logger: Logger;
  readiness: Readiness;
  holder: ServiceHolder;
}

/** The session cookie decides who is calling; without one, the development-only anonymous admin or nobody. */
function identify(config: DaemonConfig, holder: ServiceHolder, req: FastifyRequest): Identity {
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

export async function buildServer({ config, logger, readiness, holder }: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: logger as FastifyBaseLogger,
    routerOptions: { maxParamLength: 5_000 },
    trustProxy: '127.0.0.1',
  });

  registerHealthz(app, readiness, config.version);
  if (config.dev) registerDevRoutes(app, holder);

  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    // Per-request logs only in development.
    logLevel: config.dev ? 'info' : 'warn',
    trpcOptions: {
      router: appRouter,
      createContext: ({ req, res }) =>
        new DaemonContext(holder, dispatcher, identify(config, holder, req), {
          ip: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
          setupToken: headerValue(req.headers['x-hlabs-setup']),
          csrfToken: headerValue(req.headers['x-hlabs-csrf']),
          origin: headerValue(req.headers.origin),
          host: headerValue(req.headers['x-forwarded-host']) ?? headerValue(req.headers.host),
          allowedOrigins: [new URL(config.dashboardUrl).origin],
          setCookie: (cookie) => void res.header('set-cookie', cookie),
        }),
      onError: ({ path, error }) => {
        if (error.code === 'INTERNAL_SERVER_ERROR') logger.error({ err: error, path }, 'procedure failed');
      },
    } satisfies FastifyTRPCPluginOptions<typeof appRouter>['trpcOptions'],
  });

  return app;
}
