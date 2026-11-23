// hlabs's own logs (US-SYS-27): the background service (pino, `<dataDir>/logs/hlabsd.<n>.log`), the proxy (Caddy,
// `<dataDir>/caddy/caddy.log`) and app installs (`<dataDir>/logs/installs.log`, written by InstallsLog). Files are read
// from the end, newest file first, so a big log costs only what's shown. Every line is masked before it leaves.
import type { SystemLogLine, SystemLogSource } from '@hlabs/api';
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { maskSecrets } from './redact';

/** The longest line the viewer shows; the rest is cut ("…"). */
export const MAX_LINE = 2_000;
const CHUNK = 64 * 1024;

/** The files of a source, newest first. */
export function logFiles(dataDir: string, source: SystemLogSource): string[] {
  const numbered = (dir: string, re: RegExp) => {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .map((name) => ({ name, m: re.exec(name) }))
      .filter((f): f is { name: string; m: RegExpExecArray } => f.m !== null)
      .map((f) => ({ path: join(dir, f.name), n: f.m[1] === undefined ? Infinity : Number(f.m[1]) }))
      .sort((a, b) => b.n - a.n)
      .map((f) => f.path);
  };
  switch (source) {
    // pino-roll numbers its files; the highest is the one being written.
    case 'daemon':
      return numbered(join(dataDir, 'logs'), /^hlabsd\.(\d+)\.log$/);
    // InstallsLog keeps installs.log and the one before it, installs.1.log.
    case 'installs': {
      const dir = join(dataDir, 'logs');
      return ['installs.log', 'installs.1.log'].map((n) => join(dir, n)).filter((p) => existsSync(p));
    }
    // Caddy writes caddy.log and rolls it to caddy-<time>.log (newest name sorts last).
    case 'proxy': {
      const dir = join(dataDir, 'caddy');
      if (!existsSync(dir)) return [];
      const rolled = readdirSync(dir)
        .filter((n) => /^caddy-.+\.log$/.test(n))
        .sort()
        .reverse()
        .map((n) => join(dir, n));
      const current = join(dir, 'caddy.log');
      return [...(existsSync(current) ? [current] : []), ...rolled];
    }
  }
}

/** A file's lines from the last to the first, read in chunks from the end. */
export function* linesBackward(path: string): Generator<string> {
  let fd: number;
  try {
    fd = openSync(path, 'r');
  } catch {
    return;
  }
  try {
    let pos = statSync(path).size;
    let rest = Buffer.alloc(0);
    while (pos > 0) {
      const size = Math.min(CHUNK, pos);
      pos -= size;
      const chunk = Buffer.alloc(size);
      readSync(fd, chunk, 0, size, pos);
      let buf = Buffer.concat([chunk, rest]);
      let nl = buf.lastIndexOf(0x0a);
      while (nl >= 0) {
        const line = buf.subarray(nl + 1).toString('utf8');
        if (line.trim()) yield line;
        buf = buf.subarray(0, nl);
        nl = buf.lastIndexOf(0x0a);
      }
      rest = buf;
    }
    const first = rest.toString('utf8');
    if (first.trim()) yield first;
  } finally {
    closeSync(fd);
  }
}

const PINO_LEVELS: Record<number, SystemLogLine['level']> = {
  10: 'debug',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'error',
};
const TEXT_LEVELS: Record<string, SystemLogLine['level']> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  warning: 'warn',
  error: 'error',
  fatal: 'error',
  panic: 'error',
};
/** Fields every line has, left out of the text. */
const SKIP = new Set(['level', 'time', 'ts', 'v', 'pid', 'hostname', 'msg', 'logger']);

function describe(value: unknown): string {
  if (value && typeof value === 'object' && 'message' in value && typeof value.message === 'string') {
    return value.message;
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** One JSON log line (pino's or Caddy's) as the viewer shows it; null when it isn't one. */
export function parseLogLine(raw: string): { at: number; level: SystemLogLine['level']; text: string } | null {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const at = typeof obj.time === 'number' ? obj.time : typeof obj.ts === 'number' ? Math.round(obj.ts * 1000) : null;
  if (at === null) return null;
  const level =
    typeof obj.level === 'number'
      ? (PINO_LEVELS[obj.level] ?? 'info')
      : (TEXT_LEVELS[String(obj.level).toLowerCase()] ?? 'info');
  const parts = [
    ...(typeof obj.logger === 'string' ? [`[${obj.logger}]`] : []),
    ...(typeof obj.msg === 'string' ? [obj.msg] : []),
    ...Object.entries(obj)
      .filter(([k]) => !SKIP.has(k))
      .map(([k, v]) => `${k}=${describe(v)}`),
  ];
  let text = parts.join(' ');
  if (text.length > MAX_LINE) text = `${text.slice(0, MAX_LINE)}…`;
  return { at, level, text };
}

/**
 * The last `limit` lines of a source, or only those written after `since`, oldest first, with secrets masked
 * (US-SYS-27). Lines that aren't JSON log lines are skipped.
 */
export function readSystemLogs(
  dataDir: string,
  source: SystemLogSource,
  opts: { since?: number; limit: number },
): SystemLogLine[] {
  const out: SystemLogLine[] = [];
  outer: for (const file of logFiles(dataDir, source)) {
    for (const raw of linesBackward(file)) {
      const line = parseLogLine(raw);
      if (!line) continue;
      if (opts.since !== undefined && line.at <= opts.since) break outer;
      out.push({ ...line, text: maskSecrets(line.text) });
      if (out.length >= opts.limit) break outer;
    }
  }
  return out.reverse();
}

/** Every raw line of a source written at or after `from` (ms), oldest first, for the diagnostics bundle. */
export function rawLinesSince(dataDir: string, source: SystemLogSource, from: number, maxLines = 200_000): string[] {
  const out: string[] = [];
  outer: for (const file of logFiles(dataDir, source)) {
    for (const raw of linesBackward(file)) {
      const line = parseLogLine(raw);
      if (line && line.at < from) break outer;
      out.push(raw);
      if (out.length >= maxLines) break outer;
    }
  }
  return out.reverse();
}
