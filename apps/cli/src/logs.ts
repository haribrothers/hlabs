// `hlabs logs` (US-INST-25, D-140): hlabsd's own log (`<dataDir>/logs/hlabsd.<n>.log`, pino's JSON lines, rotated at
// 10 MB) as readable lines, which root and the hlabs group can read; `-f` follows it across rotations. `--app <id>` shows
// one app's container logs through tray.appLogs (the tray token may call tray.* only, D-035).
import type { LogLine } from '@hlabs/api';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Io } from './io';
import { CliError, DaemonError, NO_ACCESS, type DaemonClient } from './daemon';

export interface FollowDeps {
  sleep: (ms: number) => Promise<void>;
  /** Following stops when this is aborted (Ctrl-C ends the process otherwise). */
  signal?: AbortSignal;
}

/** How many lines `hlabs logs` shows before following. */
export const LINES = 100;
export const FOLLOW_MS = 1_000;
export const APP_FOLLOW_MS = 2_000;

const LEVELS: Record<number, string> = { 10: 'TRACE', 20: 'DEBUG', 30: 'INFO', 40: 'WARN', 50: 'ERROR', 60: 'FATAL' };
const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** One pino line as "2026-11-21 10:06:36  INFO   listening: the error"; anything else as it is. */
export function formatLine(raw: string): string {
  let entry: { level?: number; time?: number; msg?: string; err?: { message?: string } };
  try {
    entry = JSON.parse(raw) as typeof entry;
  } catch {
    return raw;
  }
  if (typeof entry !== 'object' || entry === null || typeof entry.time !== 'number') return raw;
  const level = (LEVELS[entry.level ?? 30] ?? 'INFO').padEnd(5);
  const err = entry.err?.message ? `: ${entry.err.message}` : '';
  return `${stamp(entry.time)}  ${level}  ${entry.msg ?? ''}${err}`;
}

const noAccess = () => new CliError('Run with sudo or add yourself to the hlabs group', NO_ACCESS);

/** The log files, oldest first. */
async function logFiles(dir: string): Promise<string[] | null> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EPERM') throw noAccess();
    if (code === 'ENOENT') return null;
    throw err;
  }
  const files = await Promise.all(
    names
      .filter((n) => /^hlabsd(\.\d+)?\.log$/.test(n))
      .map(async (name) => {
        const path = join(dir, name);
        return { path, mtime: (await stat(path)).mtimeMs, n: Number(/\.(\d+)\.log$/.exec(name)?.[1] ?? 0) };
      }),
  );
  return files.sort((a, b) => a.mtime - b.mtime || a.n - b.n).map((f) => f.path);
}

async function read(path: string): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EPERM') throw noAccess();
    if (code === 'ENOENT') return Buffer.alloc(0);
    throw err;
  }
}

const lines = (text: string) => text.split('\n').filter((l) => l.trim() !== '');

export async function daemonLogs(io: Io, dataDir: string, follow: boolean, deps: FollowDeps): Promise<number> {
  const dir = join(dataDir, 'logs');
  const files = await logFiles(dir);
  if (!files || files.length === 0) {
    io.out("hlabs hasn't written any logs yet.");
    if (!follow) return 0;
  }
  // The last lines, from the newest file back.
  const shown: string[] = [];
  for (const file of [...(files ?? [])].reverse()) {
    shown.unshift(...lines((await read(file)).toString('utf8')));
    if (shown.length >= LINES) break;
  }
  for (const line of shown.slice(-LINES)) io.out(formatLine(line));
  if (!follow) return 0;

  let current = files?.at(-1) ?? null;
  let offset = current ? (await read(current)).length : 0;
  let partial = '';
  const take = async (file: string, from: number) => {
    const data = await read(file);
    const text = partial + data.subarray(from).toString('utf8');
    const parts = text.split('\n');
    partial = parts.pop() ?? '';
    for (const line of parts) if (line.trim()) io.out(formatLine(line));
    return data.length;
  };
  while (!deps.signal?.aborted) {
    await deps.sleep(FOLLOW_MS);
    if (deps.signal?.aborted) break;
    const now = (await logFiles(dir)) ?? [];
    const newest = now.at(-1) ?? null;
    if (current && newest && newest !== current) {
      // Rotated: the rest of the old file, then the new one from its start.
      await take(current, offset);
      partial = '';
      current = newest;
      offset = 0;
    }
    current ??= newest;
    if (current) offset = await take(current, offset);
  }
  return 0;
}

const time = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const appLine = (l: LogLine) => `${time(l.ts)}  ${l.service}  ${l.line}`;

export async function appLogs(
  io: Io,
  client: DaemonClient,
  appId: string,
  follow: boolean,
  deps: FollowDeps,
): Promise<number> {
  const ask = async (input: { appId: string; tail?: number; since?: number }) => {
    try {
      return (await client.query<{ lines: LogLine[] }>('tray.appLogs', input)).lines;
    } catch (err) {
      if (err instanceof DaemonError && err.hlabsCode === 'NOT_FOUND') {
        throw new CliError(`There's no app called "${appId}" on this hlabs`);
      }
      throw err;
    }
  };
  const first = await ask({ appId, tail: LINES });
  for (const l of first) io.out(appLine(l));
  if (!follow) return 0;
  // Asking again from the last line's time can give that line again: those already shown are skipped.
  let last = first.at(-1)?.ts ?? Date.now();
  let seen = new Set(first.filter((l) => l.ts === last).map((l) => `${l.service}\n${l.line}`));
  while (!deps.signal?.aborted) {
    await deps.sleep(APP_FOLLOW_MS);
    if (deps.signal?.aborted) break;
    const next = (await ask({ appId, since: last })).filter(
      (l) => l.ts > last || (l.ts === last && !seen.has(`${l.service}\n${l.line}`)),
    );
    for (const l of next) io.out(appLine(l));
    if (next.length) {
      const newest = next.at(-1)!.ts;
      if (newest > last) seen = new Set();
      last = newest;
      for (const l of next) if (l.ts === last) seen.add(`${l.service}\n${l.line}`);
    }
  }
  return 0;
}
