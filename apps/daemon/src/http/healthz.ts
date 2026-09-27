import type { FastifyInstance } from 'fastify';
import type { Readiness } from '../readiness';

/** GET /healthz: 200 when ready, 503 with { reason, step, steps, stepLabel } otherwise (05 §Non-tRPC HTTP). */
export function registerHealthz(app: FastifyInstance, readiness: Readiness, version: string): void {
  app.get('/healthz', { logLevel: 'warn' }, async (_req, reply) => {
    const unavailable = readiness.unavailable();
    if (unavailable) return reply.code(503).header('cache-control', 'no-store').send(unavailable);
    return reply.header('cache-control', 'no-store').send({ status: 'ok', version });
  });
}
