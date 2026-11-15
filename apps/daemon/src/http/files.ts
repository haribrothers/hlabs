// Files over plain HTTP, the one non-tRPC surface (02 §2.4, 05 "/api/files"): previews and thumbnails (US-FILE-02,
// US-FILE-06), downloads (US-FILE-05) and resumable uploads (US-FILE-08, US-FILE-09). The session cookie says who is
// asking; every path is resolved for that person by FilesService, so access is checked here as in tRPC.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { readCookie, SESSION_COOKIE } from '../auth/sessions';
import { isTextMime, mimeOf, PREVIEW_IMAGES } from '../files/mime';
import { realInside, type Caller } from '../files/places';
import type { ServiceHolder, Services } from '../services';

/** Text previews show the first 1 MB (US-FILE-06). */
export const TEXT_PREVIEW_BYTES = 1024 * 1024;

type Who = { services: Services; caller: Caller };

/** The signed-in person (or the development admin), or a reply already sent. */
export function whoIs(
  req: FastifyRequest,
  reply: FastifyReply,
  holder: ServiceHolder,
  devAnonymousAdmin: boolean,
): Who | null {
  const services = holder.current;
  if (!services) {
    void reply.code(503).send();
    return null;
  }
  const session = services.sessions.resolve(readCookie(req.headers.cookie, SESSION_COOKIE));
  if (!session && !devAnonymousAdmin) {
    void reply.code(401).send();
    return null;
  }
  try {
    const caller = session
      ? services.files.caller(session.userId, session.role)
      : services.files.caller('dev', 'admin');
    return { services, caller };
  } catch {
    void reply.code(401).send();
    return null;
  }
}

/** A thrown hlabs error → status, with no detail in the body (never raw error text). */
export function statusOf(err: unknown): number {
  const code = (err as { cause?: { hlabsCode?: string } }).cause?.hlabsCode;
  if (code === 'FILES_ACCESS_DENIED') return 403;
  if (code === 'NOT_FOUND') return 404;
  if (code === 'FILES_INVALID_PATH' || code === 'VALIDATION_FAILED') return 400;
  if (code === 'NAS_UNREACHABLE') return 502;
  return 500;
}

/** `bytes=a-b` → the range in a file of `size` bytes; null for none or one this server won't serve. */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | 'bad' | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'bad';
  let start: number;
  let end: number;
  if (m[1] === '') {
    // The last n bytes.
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return 'bad';
  return { start, end };
}

/**
 * Sends a file, honouring Range so videos seek and interrupted downloads resume (US-FILE-05).
 */
export function sendFile(
  req: FastifyRequest,
  reply: FastifyReply,
  real: string,
  size: number,
  headers: Record<string, string>,
) {
  const range = parseRange(req.headers.range, size);
  void reply.header('accept-ranges', 'bytes').header('x-content-type-options', 'nosniff');
  for (const [k, v] of Object.entries(headers)) void reply.header(k, v);
  if (range === 'bad') return reply.code(416).header('content-range', `bytes */${size}`).send();
  if (range) {
    return reply
      .code(206)
      .header('content-range', `bytes ${range.start}-${range.end}/${size}`)
      .header('content-length', String(range.end - range.start + 1))
      .send(createReadStream(real, { start: range.start, end: range.end }));
  }
  return reply.header('content-length', String(size)).send(size === 0 ? '' : createReadStream(real));
}

/** A thumbnail `width` wide at most, made once and kept in `<dataDir>/cache/thumbs` by path, change time and width. */
async function thumbnail(cacheDir: string, real: string, mtimeMs: number, width: number): Promise<string> {
  const key = createHash('sha256').update(`${real}\0${mtimeMs}\0${width}`).digest('hex');
  const out = join(cacheDir, `${key}.webp`);
  if (
    await stat(out).then(
      () => true,
      () => false,
    )
  )
    return out;
  await mkdir(cacheDir, { recursive: true });
  const { default: sharp } = await import('sharp');
  const tmp = `${out}.${process.pid}.tmp`;
  await sharp(real, { animated: false, failOn: 'none' })
    .rotate()
    .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(tmp);
  await rename(tmp, out);
  return out;
}

export function registerFiles(app: FastifyInstance, holder: ServiceHolder, devAnonymousAdmin: boolean): void {
  // GET /api/files/preview/:token[?w=256]: a signed preview link (US-FILE-06), for the person it was made for.
  app.get(
    '/api/files/preview/:token',
    { logLevel: 'warn' },
    async (req: FastifyRequest<{ Params: { token: string }; Querystring: { w?: string } }>, reply) => {
      const who = whoIs(req, reply, holder, devAnonymousAdmin);
      if (!who) return reply;
      const { services, caller } = who;
      const claims = services.files.tokens.verify(req.params.token);
      // Gone: the dashboard asks for a new link without saying anything (US-FILE-06).
      if (claims === 'expired') return reply.code(410).header('cache-control', 'no-store').send();
      if (!claims || claims.userId !== caller.id) return reply.code(403).send();
      let real: string;
      let size: number;
      let mtimeMs: number;
      try {
        const place = await services.files.resolve(caller, claims.path);
        if (place.base === null) return reply.code(400).send();
        real = await realInside(place.base, place.host!);
        const st = await stat(real);
        if (!st.isFile()) return reply.code(400).send();
        size = st.size;
        mtimeMs = st.mtimeMs;
      } catch (err) {
        return reply.code(statusOf(err)).send();
      }
      const name = claims.path.slice(claims.path.lastIndexOf('/') + 1);
      const mime = mimeOf(name);
      const cache = { 'cache-control': 'private, max-age=300' };
      const width = Number.parseInt(req.query.w ?? '', 10);
      if (mime && PREVIEW_IMAGES.has(mime) && mime !== 'image/svg+xml' && width >= 16 && width <= 2048) {
        try {
          const thumb = await thumbnail(join(services.config.paths.dataDir, 'cache', 'thumbs'), real, mtimeMs, width);
          const st = await stat(thumb);
          return sendFile(req, reply, thumb, st.size, { 'content-type': 'image/webp', ...cache });
        } catch {
          // Not an image sharp can read: the dashboard shows the file's icon instead.
          return reply.code(415).send();
        }
      }
      if (isTextMime(mime)) {
        // The first 1 MB, always as plain text so nothing runs.
        const fh = await open(real, 'r');
        try {
          const buf = Buffer.alloc(Math.min(size, TEXT_PREVIEW_BYTES));
          const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
          return reply
            .header('content-type', 'text/plain; charset=utf-8')
            .header('x-content-type-options', 'nosniff')
            .header('x-hlabs-truncated', size > TEXT_PREVIEW_BYTES ? '1' : '0')
            .header('cache-control', 'private, no-cache')
            .send(buf.subarray(0, bytesRead));
        } finally {
          await fh.close();
        }
      }
      if (mime === 'image/svg+xml') {
        // SVGs can hold scripts: sandboxed (US-FILE-06).
        return sendFile(req, reply, real, size, {
          'content-type': 'image/svg+xml',
          'content-security-policy': 'sandbox',
          ...cache,
        });
      }
      const shown = mime && (mime.startsWith('image/') || mime.startsWith('video/') || mime === 'application/pdf');
      return sendFile(req, reply, real, size, {
        'content-type': shown ? mime : 'application/octet-stream',
        'content-disposition': shown ? 'inline' : 'attachment',
        ...cache,
      });
    },
  );
}
