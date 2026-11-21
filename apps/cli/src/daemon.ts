// How the `hlabs` command talks to hlabsd (D-035, D-112): the plain tray token file in the data dir (0640, group
// `hlabs`, so root and the hlabs group can read it) as a bearer token, to `tray.*` procedures on loopback only.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** A problem the command explains in words, with its exit code. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly code = 1,
  ) {
    super(message);
  }
}

/** hlabs answered with one of its error codes (`hlabsCode`, packages/api/src/errors.ts). */
export class DaemonError extends CliError {
  constructor(readonly hlabsCode: string | undefined) {
    super(`hlabs answered with an error${hlabsCode ? ` (${hlabsCode})` : ''}`);
  }
}

export interface DaemonClient {
  query<T>(path: string, input?: unknown): Promise<T>;
  mutate<T>(path: string, input?: unknown): Promise<T>;
}

export interface ClientOptions {
  /** `/var/lib/hlabs` (HLABS_DATA_DIR in development and tests). */
  dataDir: string;
  /** hlabsd's loopback port (7474; HLABS_PORT). */
  port: number;
}

export const UNREACHABLE = 2;
export const NO_ACCESS = 77;

export function clientOptions(env: NodeJS.ProcessEnv = process.env): ClientOptions {
  return { dataDir: env.HLABS_DATA_DIR ?? '/var/lib/hlabs', port: Number(env.HLABS_PORT ?? 7474) };
}

async function readToken(dataDir: string): Promise<string> {
  const file = join(dataDir, 'tray.token');
  try {
    const token = (await readFile(file, 'utf8')).trim();
    if (token) return token;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EPERM') {
      throw new CliError('Run with sudo or add yourself to the hlabs group', NO_ACCESS);
    }
  }
  throw new CliError(`hlabs isn't installed on this computer (there's no ${file})`, UNREACHABLE);
}

export function daemonClient(options: ClientOptions): DaemonClient {
  let token: Promise<string> | undefined;
  const call = async <T>(path: string, init: { method: 'GET' | 'POST'; input?: unknown }): Promise<T> => {
    token ??= readToken(options.dataDir);
    const auth = { authorization: `Bearer ${await token}` };
    const base = `http://127.0.0.1:${options.port}/trpc/${path}`;
    let res: Response;
    try {
      res =
        init.method === 'GET'
          ? await fetch(
              init.input === undefined ? base : `${base}?input=${encodeURIComponent(JSON.stringify(init.input))}`,
              {
                headers: auth,
              },
            )
          : await fetch(base, {
              method: 'POST',
              headers: { ...auth, 'content-type': 'application/json' },
              body: JSON.stringify(init.input ?? null),
            });
    } catch {
      throw new CliError("Can't reach hlabs. Check that it's running: systemctl status hlabsd", UNREACHABLE);
    }
    const body = (await res.json().catch(() => null)) as {
      result?: { data: T };
      error?: { message?: string; data?: { hlabsCode?: string } };
    } | null;
    if (res.ok && body?.result) return body.result.data;
    const code = body?.error?.data?.hlabsCode;
    if (code === 'TRAY_TOKEN_REJECTED') {
      throw new CliError("hlabs didn't accept its token. Restart it: sudo systemctl restart hlabsd", NO_ACCESS);
    }
    throw new DaemonError(code);
  };
  return {
    query: (path, input) => call(path, { method: 'GET', input }),
    mutate: (path, input) => call(path, { method: 'POST', input }),
  };
}
