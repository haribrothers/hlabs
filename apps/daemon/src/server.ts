// Fastify on 127.0.0.1 only, with tRPC (+ SSE subscriptions) under /trpc and the plain HTTP routes.
import { appRouter } from '@hlabs/api';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyRequest } from 'fastify';
import type { DaemonConfig } from './config';
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

/** Phase 0: no sessions yet, so every caller is anonymous unless the dev flag is on. */
function identify(config: DaemonConfig, _req: FastifyRequest): Identity {
  if (config.devAnonymousAdmin) return { kind: 'user', userId: 'dev', role: 'admin' };
  return { kind: 'anonymous' };
}

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
      createContext: ({ req }) =>
        new DaemonContext(holder, dispatcher, identify(config, req), {
          ip: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
        }),
      onError: ({ path, error }) => {
        if (error.code === 'INTERNAL_SERVER_ERROR') logger.error({ err: error, path }, 'procedure failed');
      },
    } satisfies FastifyTRPCPluginOptions<typeof appRouter>['trpcOptions'],
  });

  return app;
}
