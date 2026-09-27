import { onboardingStepSchema } from '@hlabs/api';
import { getSetting, setSetting, users } from '@hlabs/db';
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

  // First-run gate in e2e (US-ONB-01): the setup URL the daemon printed, and a shortcut past onboarding
  // until the onboarding stories that complete it are built.
  app.get('/dev/setup-url', async (_req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    return { url: await services.onboarding.setupUrl() };
  });

  // Puts onboarding back at a step, as a fresh first run: users (and so their sessions) are removed, and the
  // setup token is kept or made again (e2e specs start from a known state).
  const resetBody = z.object({ step: onboardingStepSchema.default('welcome') }).default({ step: 'welcome' });
  app.post('/dev/reset-onboarding', async (req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    const { step } = resetBody.parse(req.body ?? undefined);
    services.db.delete(users).run();
    setSetting(services.db, 'onboarding', { ...getSetting(services.db, 'onboarding'), completedAt: null, step });
    return { url: await services.onboarding.prepareSetupToken() };
  });

  app.post('/dev/complete-onboarding', async (_req, reply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send({ reason: 'starting' });
    if (!services.onboarding.completed) await services.onboarding.markComplete();
    return { completed: true };
  });
}
