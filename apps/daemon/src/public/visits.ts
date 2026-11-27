// Visits to a public app (US-APP-29): Caddy's JSON access log for the public listener, under `<dataDir>/logs/public/`
// (rolled at 10 MB, kept 7 days, never in backups or diagnostics). Each line becomes a visit: when, the visitor's address
// (CF-Connecting-IP, through cloudflared) and country (CF-IPCountry), the path, and what happened, read from the status
// and where it went: signed in (let through to the app), asked to sign in, refused, too many tries.
import type { Visit, VisitResult } from '@hlabs/api';
import { appendFileSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_ACCESS_LOG } from '../caddy/public';

export const VISITS_KEEP_MS = 7 * 24 * 60 * 60_000;

/** The parts of a Caddy access-log line Visits reads. */
export interface AccessLine {
  /** Seconds since the epoch, with a fraction. */
  ts: number;
  status: number;
  request: {
    host: string;
    method: string;
    uri: string;
    client_ip?: string;
    remote_ip?: string;
    headers?: Record<string, string[] | undefined>;
  };
  resp_headers?: Record<string, string[] | undefined>;
}

const header = (headers: Record<string, string[] | undefined> | undefined, name: string) => {
  if (!headers) return undefined;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key]?.[0] : undefined;
};

/** What a request's answer means for the person (US-APP-29). */
export function visitResult(line: Pick<AccessLine, 'status' | 'request' | 'resp_headers'>): VisitResult {
  const path = line.request.uri.split('?')[0] ?? '/';
  const { status } = line;
  if (status === 429) return 'tooManyTries';
  if (path === '/.hlabs/sign-in') {
    if (line.request.method !== 'POST') return 'askedToSignIn';
    if (status === 303) return 'signedIn';
    if (status === 401 || status === 403) return 'refused';
    return 'askedToSignIn';
  }
  if (status === 403) return 'refused';
  if (status === 401) return 'askedToSignIn';
  if ((status === 302 || status === 303) && (header(line.resp_headers, 'location') ?? '').startsWith('/.hlabs/sign-in'))
    return 'askedToSignIn';
  return 'signedIn';
}

export function toVisit(line: AccessLine): Visit {
  return {
    at: Math.round(line.ts * 1000),
    ip: line.request.client_ip ?? line.request.remote_ip ?? '',
    country: header(line.request.headers, 'cf-ipcountry')?.toUpperCase().slice(0, 2) || null,
    method: line.request.method,
    path: (line.request.uri.split('?')[0] ?? '/').slice(0, 500),
    status: line.status,
    result: visitResult(line),
  };
}

/** The log files, newest first (`access.log`, then Caddy's rolled `access-<time>.log`). */
function logFiles(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => /^access(?:-.+)?\.log$/.test(n));
  } catch {
    return [];
  }
  return names
    .map((n) => ({ path: join(dir, n), mtime: statSync(join(dir, n)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map((f) => f.path);
}

function parse(text: string): AccessLine | null {
  try {
    const line = JSON.parse(text) as AccessLine;
    return typeof line.ts === 'number' && typeof line.status === 'number' && line.request?.host ? line : null;
  } catch {
    return null;
  }
}

/** `<ts>~<skip>`: older than that line's time, past `skip` lines with the same time. */
function readCursor(cursor: string | undefined): { ts: number; skip: number } | null {
  if (!cursor) return null;
  const [ts, skip] = cursor.split('~').map(Number);
  return Number.isFinite(ts) && Number.isFinite(skip) ? { ts: ts!, skip: skip! } : null;
}

/** One page of an address's visits in the last 7 days, newest first. */
export function readVisits(
  dir: string,
  hostname: string,
  opts: { now: number; result?: VisitResult; cursor?: string; limit: number },
): { items: Visit[]; nextCursor: string | null } {
  const host = hostname.toLowerCase();
  const oldest = (opts.now - VISITS_KEEP_MS) / 1000;
  const after = readCursor(opts.cursor);
  const items: Array<{ visit: Visit; ts: number }> = [];
  let sameTs = 0;
  let lastTs: number | null = null;
  outer: for (const file of logFiles(dir)) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = text.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const raw = lines[i];
      if (!raw) continue;
      const line = parse(raw);
      if (!line) continue;
      if (line.ts < oldest) break outer;
      if (line.request.host.replace(/:\d+$/, '').toLowerCase() !== host) continue;
      const visit = toVisit(line);
      if (opts.result && visit.result !== opts.result) continue;
      if (after) {
        if (line.ts > after.ts) continue;
        if (line.ts === after.ts) {
          if (lastTs !== line.ts) {
            lastTs = line.ts;
            sameTs = 0;
          }
          if (sameTs++ < after.skip) continue;
        }
      }
      items.push({ visit, ts: line.ts });
      if (items.length > opts.limit) break outer;
    }
  }
  const page = items.slice(0, opts.limit);
  if (items.length <= opts.limit) return { items: page.map((i) => i.visit), nextCursor: null };
  const last = page.at(-1)!.ts;
  // Lines in this page with the last one's time, plus those skipped before it (a cursor in the middle of a tie).
  const tied = page.filter((i) => i.ts === last).length + (after && after.ts === last ? after.skip : 0);
  return { items: page.map((i) => i.visit), nextCursor: `${last}~${tied}` };
}

/** Writes a line as Caddy would (development and e2e, where there's no Caddy: `POST /dev/public-visit`). */
export function appendAccessLine(dir: string, line: AccessLine): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  appendFileSync(join(dir, PUBLIC_ACCESS_LOG), `${JSON.stringify(line)}\n`, { mode: 0o600 });
}
