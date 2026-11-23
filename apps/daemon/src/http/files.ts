// Files over plain HTTP, the one non-tRPC surface (02 §2.4, 05 "/api/files"): previews and thumbnails (US-FILE-02,
// US-FILE-06), downloads (US-FILE-05) and resumable uploads (US-FILE-08, US-FILE-09). The session cookie says who is
// asking; every path is resolved for that person by FilesService, so access is checked here as in tRPC.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { csrfMatches, readCookie, SESSION_COOKIE } from '../auth/sessions';
import type { Readable } from 'node:stream';
import { z } from 'zod';
import { CHUNK_MAX } from '../files/uploads';
import { isTextMime, mimeOf, PREVIEW_IMAGES } from '../files/mime';
import yazl from 'yazl';
import { inside, isHidden, realInside, type Caller, type Place } from '../files/places';
import type { Logger } from '../logger';
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

/** `attachment` with the name for every browser: ASCII in `filename`, the real name in `filename*` (RFC 6266). */
export function attachment(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** What a download is called: the file or folder's name; a place's top by the place ("Home", "Anu", "NAS · Media"). */
export function downloadName(place: Place): string {
  const last = place.rest[place.rest.length - 1];
  if (last) return last;
  if (place.area === 'home') return 'Home';
  if (place.area === 'shared') return 'Shared';
  return (place.name ?? 'hlabs').replace(/[/\\]/g, '-');
}

/** `inline`, with the file's name for when it's saved from the browser's viewer. */
export const inline = (name: string) => attachment(name).replace(/^attachment/, 'inline');

/** Name of a multi-item download (US-FILE-05). */
export const MULTI_ZIP = 'hlabs files.zip';

/**
 * Adds a folder's visible files to the zip under `prefix/`, one level at a time; linked folders aren't followed and
 * links leading out of the place are left out. Empty folders are kept.
 */
async function addFolder(zip: yazl.ZipFile, realBase: string, dir: string, prefix: string, signal: AbortSignal) {
  const queue: Array<{ dir: string; prefix: string }> = [{ dir, prefix }];
  while (queue.length && !signal.aborted) {
    const next = queue.shift()!;
    const names = (await readdir(next.dir).catch(() => [] as string[])).filter((n) => !isHidden(n)).sort();
    if (!names.length) zip.addEmptyDirectory(next.prefix);
    for (const name of names) {
      const host = join(next.dir, name);
      const link = await lstat(host).catch(() => null);
      if (!link) continue;
      if (link.isSymbolicLink()) {
        const real = await realpath(host).catch(() => null);
        if (!real || !inside(realBase, real)) continue;
      }
      const st = await stat(host).catch(() => null);
      if (!st) continue;
      if (st.isDirectory() && !link.isSymbolicLink()) queue.push({ dir: host, prefix: `${next.prefix}/${name}` });
      else if (st.isFile()) zip.addFile(host, `${next.prefix}/${name}`, { compress: false, mtime: st.mtime });
    }
  }
}

/** An hlabs error as an HTTP answer for the upload routes: its status and `{ hlabsCode, detail }` (never raw text). */
function sendError(reply: FastifyReply, err: unknown, logger: Pick<Logger, 'warn'>) {
  const cause = (err as { cause?: { hlabsCode?: string; detail?: unknown } }).cause;
  const code = cause?.hlabsCode;
  if (!code) {
    logger.warn({ err }, 'upload failed');
    return reply.code(500).send({ hlabsCode: 'INTERNAL', detail: null });
  }
  const status =
    code === 'FILES_NO_SPACE'
      ? 507
      : code === 'UPLOAD_OFFSET_MISMATCH' || code === 'UPLOAD_IN_PROGRESS' || code === 'FILES_NAME_EXISTS'
        ? 409
        : code === 'FILES_READ_ONLY'
          ? 403
          : code === 'FILES_INVALID_NAME' || code === 'VALIDATION_FAILED'
            ? 400
            : statusOf(err);
  return reply.code(status).send({ hlabsCode: code, detail: cause?.detail ?? null });
}

/** Mutations need the session's CSRF header, and a dashboard Origin when one is sent (07 §7.3), as in tRPC. */
export function csrfOk(req: FastifyRequest, raw: string | null, allowedOrigins: () => readonly string[]): boolean {
  if (raw === null) return true; // The development admin (no session).
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null;
  if (origin !== null && !allowedOrigins().includes(origin)) return false;
  const header = req.headers['x-hlabs-csrf'];
  return csrfMatches(raw, typeof header === 'string' ? header : null);
}

const uploadBody = z.object({
  path: z.string().min(1).max(4096).startsWith('/'),
  name: z.string().min(1).max(1024),
  size: z.number().int().nonnegative(),
  onConflict: z.enum(['skip', 'keepBoth', 'replace']).optional(),
});

export function registerFiles(
  app: FastifyInstance,
  holder: ServiceHolder,
  devAnonymousAdmin: boolean,
  allowedOrigins: () => readonly string[] = () => [],
): void {
  // Upload chunks arrive as raw bytes (tus-style), streamed straight to the partial file.
  app.addContentTypeParser('application/offset+octet-stream', (_req, payload, done) => done(null, payload));

  /** Who's uploading, with their CSRF checked; null when a reply was sent. */
  const uploader = (req: FastifyRequest, reply: FastifyReply) => {
    const who = whoIs(req, reply, holder, devAnonymousAdmin);
    if (!who) return null;
    const raw = readCookie(req.headers.cookie, SESSION_COOKIE) ?? null;
    if (!csrfOk(req, who.services.sessions.resolve(raw) ? raw : null, allowedOrigins)) {
      void reply.code(403).send({ hlabsCode: 'CSRF_REJECTED', detail: null });
      return null;
    }
    return who;
  };

  // POST /api/files/upload { path, name, size, onConflict } → { id, offset } (US-FILE-08): a new upload, or the one
  // already there for the same folder, name and size (US-FILE-09).
  app.post('/api/files/upload', { logLevel: 'warn' }, async (req, reply) => {
    const who = uploader(req, reply);
    if (!who) return reply;
    const body = uploadBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ hlabsCode: 'VALIDATION_FAILED', detail: null });
    try {
      return await who.services.uploads.create(who.caller, body.data);
    } catch (err) {
      return sendError(reply, err, who.services.logger);
    }
  });

  // HEAD /api/files/upload/:id → Upload-Offset (US-FILE-09: Resume asks where the server is).
  app.head(
    '/api/files/upload/:id',
    { logLevel: 'warn' },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const who = whoIs(req, reply, holder, devAnonymousAdmin);
      if (!who) return reply;
      try {
        const { offset, size } = await who.services.uploads.offset(who.caller, req.params.id);
        return reply
          .header('upload-offset', String(offset))
          .header('upload-length', String(size))
          .header('cache-control', 'no-store')
          .send();
      } catch (err) {
        return reply.code(statusOf(err)).send();
      }
    },
  );

  // PATCH /api/files/upload/:id (Upload-Offset, up to 8 MB) → { offset, done } (US-FILE-08, US-FILE-09).
  app.patch(
    '/api/files/upload/:id',
    { logLevel: 'warn', bodyLimit: CHUNK_MAX },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const who = uploader(req, reply);
      if (!who) return reply;
      if (req.headers['content-type'] !== 'application/offset+octet-stream') {
        return reply.code(415).send({ hlabsCode: 'VALIDATION_FAILED', detail: null });
      }
      const offset = Number(req.headers['upload-offset']);
      if (!Number.isSafeInteger(offset) || offset < 0) {
        return reply.code(400).send({ hlabsCode: 'VALIDATION_FAILED', detail: null });
      }
      try {
        const result = await who.services.uploads.append(who.caller, req.params.id, offset, req.body as Readable);
        return reply.header('upload-offset', String(result.offset)).send(result);
      } catch (err) {
        return sendError(reply, err, who.services.logger);
      }
    },
  );

  // DELETE /api/files/upload/:id: cancel (US-FILE-09): the session and its partial file go.
  app.delete(
    '/api/files/upload/:id',
    { logLevel: 'warn' },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const who = uploader(req, reply);
      if (!who) return reply;
      try {
        await who.services.uploads.cancel(who.caller, req.params.id);
        return { ok: true };
      } catch (err) {
        return sendError(reply, err, who.services.logger);
      }
    },
  );

  // GET /api/files/download?path=…[&path=…] (US-FILE-05): a file as it is (with Range), or a folder or several items as
  // a zip streamed as it's made, never built on disk first. Anything the person can't reach: 403 and no bytes.
  app.get(
    '/api/files/download',
    { logLevel: 'warn' },
    async (req: FastifyRequest<{ Querystring: { path?: string | string[] } }>, reply) => {
      const who = whoIs(req, reply, holder, devAnonymousAdmin);
      if (!who) return reply;
      const { services, caller } = who;
      const paths = [req.query.path ?? []].flat().filter((p) => typeof p === 'string' && p);
      if (!paths.length || paths.length > 1000) return reply.code(400).send();
      const items: Array<{ place: Place; real: string; isFile: boolean; size: number; name: string }> = [];
      try {
        for (const path of paths) {
          const place = await services.files.resolve(caller, path);
          if (place.base === null) return reply.code(400).send();
          const real = await realInside(place.base, place.host!);
          const st = await stat(real);
          items.push({ place, real, isFile: st.isFile(), size: st.size, name: downloadName(place) });
        }
      } catch (err) {
        return reply.code(statusOf(err)).send();
      }
      const only = items.length === 1 ? items[0]! : null;
      if (only?.isFile) {
        return sendFile(req, reply, only.real, only.size, {
          'content-type': mimeOf(only.name) ?? 'application/octet-stream',
          'content-disposition': attachment(only.name),
          'cache-control': 'private, no-store',
        });
      }
      // A zip: stored, not compressed (photos and videos already are), Zip64 when it needs to be.
      const zip = new yazl.ZipFile();
      const abort = new AbortController();
      // A file that vanishes or can't be read mid-zip: the download stops (the browser shows it failed).
      zip.on('error', () => reply.raw.destroy());
      req.raw.once('close', () => abort.abort());
      const used = new Set<string>();
      const unique = (name: string) => {
        let n = name;
        for (let i = 2; used.has(n); i++) n = `${name} (${i})`;
        used.add(n);
        return n;
      };
      void (async () => {
        for (const item of items) {
          if (abort.signal.aborted) break;
          const name = unique(item.name);
          if (item.isFile) zip.addFile(item.real, name, { compress: false });
          else await addFolder(zip, await realpath(item.place.base!), item.real, name, abort.signal);
        }
        zip.end();
      })().catch(() => zip.end());
      return reply
        .header('content-type', 'application/zip')
        .header('content-disposition', attachment(only ? `${only.name}.zip` : MULTI_ZIP))
        .header('cache-control', 'private, no-store')
        .header('x-content-type-options', 'nosniff')
        .send(zip.outputStream);
    },
  );

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
        'content-disposition': shown ? inline(name) : attachment(name),
        ...cache,
      });
    },
  );
}
