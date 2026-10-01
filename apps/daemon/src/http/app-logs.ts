// GET /api/apps/:appId/logs/download?service= (US-APP-10): an app's whole logs as a plain-text file, for admins only
// (logs can hold secrets, 07 §7.6). Streamed from Docker to the response, never held whole in memory. One service's
// lines are `<time> <line>`; all of them `<service> <time> <line>`, merged by time.
import { apps } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { readCookie, SESSION_COOKIE } from '../auth/sessions';
import type { ServiceHolder } from '../services';

type Request = FastifyRequest<{ Params: { appId: string }; Querystring: { service?: string } }>;

/** `immich-logs-20261001-1702.log`, in this computer's time. */
export function logFileName(appId: string, at = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const day = `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}`;
  return `${appId}-logs-${day}-${two(at.getHours())}${two(at.getMinutes())}.log`;
}

export function registerAppLogs(app: FastifyInstance, holder: ServiceHolder, devAnonymousAdmin: boolean): void {
  app.get('/api/apps/:appId/logs/download', { logLevel: 'warn' }, async (req: Request, reply: FastifyReply) => {
    const services = holder.current;
    if (!services) return reply.code(503).send();
    const session = services.sessions.resolve(readCookie(req.headers.cookie, SESSION_COOKIE));
    if (!session && !devAnonymousAdmin) return reply.code(401).send();
    if (session && session.role !== 'admin') return reply.code(403).send();
    const { appId } = req.params;
    if (!services.db.select({ id: apps.id }).from(apps).where(eq(apps.id, appId)).get()) {
      return reply.code(404).send();
    }
    if (!services.engine.client) return reply.code(503).send();
    const service = req.query.service || undefined;
    const abort = new AbortController();
    req.raw.once('close', () => abort.abort());
    const lines = services.logs.everything(appId, { service }, abort.signal);
    const text = Readable.from(
      (async function* () {
        for await (const l of lines) {
          const time = new Date(l.ts).toISOString();
          yield service ? `${time} ${l.line}\n` : `${l.service} ${time} ${l.line}\n`;
        }
      })(),
    );
    return reply
      .header('content-type', 'text/plain; charset=utf-8')
      .header('content-disposition', `attachment; filename="${logFileName(appId)}"`)
      .header('cache-control', 'no-store')
      .header('x-content-type-options', 'nosniff')
      .send(text);
  });
}
