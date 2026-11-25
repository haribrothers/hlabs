// The person's own wallpaper photo over plain HTTP (US-ACCT-32, 05 "Non-tRPC HTTP"): upload it (session and CSRF
// header, as every mutation) and fetch it back. Only ever the caller's own photo: neither route takes a user.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { readCookie, SESSION_COOKIE } from '../auth/sessions';
import { dashboardSession } from './via';
import { customWallpaperFile, saveWallpaper, WALLPAPER_MAX_BYTES } from '../account/appearance';
import type { ServiceHolder, Services } from '../services';
import { csrfOk } from './files';

/** The signed-in person, or a reply already sent. */
function signedIn(req: FastifyRequest, reply: FastifyReply, holder: ServiceHolder) {
  const services = holder.current;
  if (!services?.readiness.isReady) {
    void reply.code(503).send();
    return null;
  }
  const raw = readCookie(req.headers.cookie, SESSION_COOKIE) ?? null;
  const session = raw ? dashboardSession(services, req.headers, raw) : null;
  if (!raw || !session) {
    void reply.code(401).send({ hlabsCode: 'AUTH_REQUIRED', detail: null });
    return null;
  }
  return { services, raw, userId: session.userId };
}

const deps = (services: Services) => ({ db: services.db, dataDir: services.config.paths.dataDir });

export function registerAppearance(
  app: FastifyInstance,
  holder: ServiceHolder,
  allowedOrigins: () => readonly string[] = () => [],
): void {
  void app.register(async (scope) => {
    // The photo arrives as the raw file, whatever type the browser gave it: its bytes decide what it is.
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: WALLPAPER_MAX_BYTES }, (_req, body, done) =>
      done(null, body),
    );
    // Too big (Fastify stops reading at the limit) or no body: the same answer as a file that isn't a photo.
    scope.setErrorHandler((err: { statusCode?: number }, _req, reply) => {
      const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
      return reply.code(status).send({ hlabsCode: status < 500 ? 'VALIDATION_FAILED' : 'INTERNAL', detail: null });
    });

    // POST /api/appearance/wallpaper (the image's bytes) → { appearance }: their wallpaper is now this photo.
    scope.post(
      '/api/appearance/wallpaper',
      { logLevel: 'warn', bodyLimit: WALLPAPER_MAX_BYTES },
      async (req, reply) => {
        const who = signedIn(req, reply, holder);
        if (!who) return reply;
        if (!csrfOk(req, who.raw, allowedOrigins)) {
          return reply.code(403).send({ hlabsCode: 'CSRF_REJECTED', detail: null });
        }
        if (!Buffer.isBuffer(req.body)) return reply.code(400).send({ hlabsCode: 'VALIDATION_FAILED', detail: null });
        try {
          return { appearance: await saveWallpaper(deps(who.services), who.userId, req.body) };
        } catch (err) {
          const code = (err as { cause?: { hlabsCode?: string } }).cause?.hlabsCode;
          if (code === 'VALIDATION_FAILED') return reply.code(400).send({ hlabsCode: code, detail: null });
          who.services.logger.warn({ err }, "couldn't save a wallpaper");
          return reply.code(500).send({ hlabsCode: 'INTERNAL', detail: null });
        }
      },
    );

    // GET /api/appearance/wallpaper?v=<uploadedAt> → the caller's own photo. `v` changes with each upload, so it's
    // kept by this browser for good (private: never by a shared cache).
    scope.get('/api/appearance/wallpaper', { logLevel: 'warn' }, async (req, reply) => {
      const who = signedIn(req, reply, holder);
      if (!who) return reply;
      const file = customWallpaperFile(deps(who.services), who.userId);
      const size = file
        ? await stat(file.path).then(
            (s) => s.size,
            () => null,
          )
        : null;
      if (!file || size === null) return reply.code(404).send({ hlabsCode: 'NOT_FOUND', detail: null });
      return reply
        .type(file.type)
        .header('content-length', String(size))
        .header('cache-control', 'private, max-age=31536000, immutable')
        .header('x-content-type-options', 'nosniff')
        .send(createReadStream(file.path));
    });
  });
}
