// App logos and screenshots (US-STORE-01, US-STORE-06, US-HOME-03), for anyone signed in:
//   GET /api/store/apps/:sourceId/:appId/assets/*   a catalogue app's
//   GET /api/apps/:appId/assets/*                   an installed app's (from the source it came from)
// SVGs are served with a CSP that forbids scripts, so opening one directly can't run anything.
import { apps } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { readCookie, SESSION_COOKIE } from '../auth/sessions';
import type { ServiceHolder } from '../services';
import { ASSET_TYPES, BUILTIN_SOURCE_ID } from '../store/catalog';

type Params = { sourceId?: string; appId: string; '*': string };

export function registerAppAssets(app: FastifyInstance, holder: ServiceHolder, devAnonymousAdmin: boolean): void {
  const serve = async (req: FastifyRequest<{ Params: Params }>, reply: FastifyReply) => {
    const services = holder.current;
    if (!services) return reply.code(503).send();
    const signedIn = devAnonymousAdmin || services.sessions.resolve(readCookie(req.headers.cookie, SESSION_COOKIE));
    if (!signedIn) return reply.code(401).send();
    const { appId } = req.params;
    const sourceId =
      req.params.sourceId ??
      services.db.select({ sourceId: apps.sourceId }).from(apps).where(eq(apps.id, appId)).get()?.sourceId ??
      BUILTIN_SOURCE_ID;
    const path = services.catalog.assetPath(sourceId, appId, req.params['*']);
    if (!path) return reply.code(404).send();
    return (
      reply
        .header('content-type', ASSET_TYPES[extname(path).toLowerCase()]!)
        .header('cache-control', 'private, max-age=3600')
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:")
        // Logos and screenshots are small: read whole rather than streamed.
        .send(await readFile(path))
    );
  };
  app.get('/api/store/apps/:sourceId/:appId/assets/*', { logLevel: 'warn' }, serve);
  app.get('/api/apps/:appId/assets/*', { logLevel: 'warn' }, serve);
}
