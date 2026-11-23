// GET /api/diagnostics/:jobId (US-SYS-28): the diagnostics bundle a `diagnostics` job built, for the admin who asked
// for it, within 15 minutes of it being ready. Never cached; 404 for anything else (someone else's, unknown, expired).
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createReadStream } from 'node:fs';
import { readCookie, SESSION_COOKIE } from '../auth/sessions';
import type { ServiceHolder } from '../services';

type Request = FastifyRequest<{ Params: { jobId: string } }>;

export function registerDiagnostics(app: FastifyInstance, holder: ServiceHolder, devAnonymousAdmin: boolean): void {
  app.get('/api/diagnostics/:jobId', { logLevel: 'warn' }, async (req: Request, reply: FastifyReply) => {
    const services = holder.current;
    if (!services?.readiness.isReady) return reply.code(503).send();
    const session = services.sessions.resolve(readCookie(req.headers.cookie, SESSION_COOKIE));
    if (!session && !devAnonymousAdmin) return reply.code(401).send();
    if (session && session.role !== 'admin') return reply.code(403).send();
    const file = services.advanced.diagnostics.file(req.params.jobId, session ? session.userId : 'dev');
    if (!file) return reply.code(404).send();
    return reply
      .header('content-type', 'application/zip')
      .header('content-disposition', `attachment; filename="${file.name}"`)
      .header('cache-control', 'no-store')
      .header('x-content-type-options', 'nosniff')
      .send(createReadStream(file.path));
  });
}
