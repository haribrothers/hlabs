import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServiceHolder } from '../services';

/** Development-only routes. Never registered in production. */
export function registerDevRoutes(app: FastifyInstance, holder: ServiceHolder): void {
  const body = z
    .object({ message: z.string().max(200).default('Hello from hlabsd') })
    .default({ message: 'Hello from hlabsd' });

  app.post('/dev/emit-test-event', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const { message } = body.parse(req.body ?? undefined);
    const entry = services.bus.emit('system.test', { message });
    return { id: entry.id };
  });
}
