// The store install matrix (phase 2 "Done when", D-071): each seeded app installs, opens at https://<app>.hlabs.local,
// restarts and uninstalls, with the real engine, Caddy and the app's own name. Runs an isolated daemon (its own data
// folder, ports and compose prefix), so a dev instance on the same machine is never touched.
//
//   node scripts/store-matrix.ts                  every app in store/apps
//   node scripts/store-matrix.ts uptime-kuma gitea  just these
//
// CI has no mDNS, so "opens at" is checked by asking Caddy for the app's name directly (TLS SNI and Host
// <app>.hlabs.local, checked against hlabs's own CA), which is what a browser that resolves the name gets.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { request } from 'node:https';
import { join, resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..');
const DATA_DIR = resolve(REPO, '.matrix-data');
const DAEMON_PORT = 7674;
const PORTS = {
  https: Number(process.env.MATRIX_HTTPS_PORT ?? 9443),
  http: Number(process.env.MATRIX_HTTP_PORT ?? 9080),
};
const DAEMON = `http://127.0.0.1:${DAEMON_PORT}`;
const INSTALL_MS = 20 * 60_000;
const SETTLE_MS = 5 * 60_000;

type Reply<T = Record<string, unknown>> = {
  result?: { data: T };
  error?: { json?: unknown; data?: { hlabsCode?: string } };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const say = (line: string) => void process.stdout.write(`${line}\n`);
const log = (...parts: unknown[]) => say([new Date().toISOString().slice(11, 19), ...parts].join(' '));

/** The seeded admin's session, as a browser holds it: the cookie, and the CSRF token mutations carry. */
const session = { cookie: '', csrf: '' };

async function signIn() {
  const res = await fetch(`${DAEMON}/dev/sign-in`, { redirect: 'manual' });
  session.cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
  if (!session.cookie) throw new Error(`sign-in failed: ${res.status}`);
  const me = await query<{ csrfToken: string }>('auth.me');
  session.csrf = me.result?.data.csrfToken ?? '';
}

async function query<T = Record<string, unknown>>(path: string, input?: unknown): Promise<Reply<T>> {
  const qs = input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const res = await fetch(`${DAEMON}/trpc/${path}${qs}`, { headers: { cookie: session.cookie } });
  return (await res.json()) as Reply<T>;
}

async function mutate<T = Record<string, unknown>>(path: string, input: unknown): Promise<Reply<T>> {
  const res = await fetch(`${DAEMON}/trpc/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: session.cookie, 'x-hlabs-csrf': session.csrf },
    body: JSON.stringify(input),
  });
  return (await res.json()) as Reply<T>;
}

async function until<T>(what: string, ms: number, check: () => Promise<T | undefined>): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check().catch(() => undefined);
    if (value !== undefined) return value;
    if (Date.now() > end) throw new Error(`timed out: ${what}`);
    await sleep(2_000);
  }
}

function startDaemon(): ChildProcess {
  rmSync(DATA_DIR, { recursive: true, force: true });
  const child = spawn('pnpm', ['--filter', '@hlabs/daemon', 'exec', 'tsx', 'src/main.ts'], {
    cwd: REPO,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      HLABS_PORT: String(DAEMON_PORT),
      HLABS_DATA_DIR: DATA_DIR,
      HLABS_DASHBOARD_URL: DAEMON,
      HLABS_PROXY: 'caddy',
      HLABS_MDNS: '0',
      HLABS_DEV_NO_ENGINE_INSTALL: '1',
      HLABS_DEV_NO_ENGINE_CONTROL: '1',
      // A pretend Tailscale: e2e never touches the real one (CI has none).
      HLABS_DEV_FAKE_TAILSCALE: '1',
      HLABS_COMPOSE_PREFIX: 'hlabs-matrix',
      HLABS_LOG_LEVEL: 'warn',
    },
    detached: true,
  });
  return child;
}

/** A page through Caddy, by name (an app's, or the dashboard's): status and where a redirect goes. */
function openHost(host: string): Promise<{ status: number; location: string | null }> {
  const ca = readFileSync(join(DATA_DIR, 'caddy', 'data', 'pki', 'authorities', 'local', 'root.crt'));
  return new Promise((ok, fail) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: PORTS.https,
        path: '/',
        servername: host,
        // Signed in, as the browser that opens the app is: the cookie is for .hlabs.local (US-AUTH-17).
        headers: { host, cookie: session.cookie },
        ca,
        timeout: 30_000,
      },
      (res) => {
        res.resume();
        ok({ status: res.statusCode ?? 0, location: res.headers.location ?? null });
      },
    );
    req.on('timeout', () => req.destroy(new Error('no answer in 30 s')));
    req.on('error', fail);
    req.end();
  });
}

interface StoreDetails {
  folders: Array<{
    key: string;
    mode: 'ro' | 'rw';
    default: { storageLocationId: string | null; subpath: string } | null;
  }>;
  install: { env: Array<{ key: string; default: string | null; required: boolean; options: string[] | null }> };
}

/** What the app's containers said, for a failure in CI: the last lines of each, and how they ended. */
function containerLogs(appId: string): string {
  try {
    const project = `hlabs-matrix-${appId}`;
    const ids = execFileSync('docker', ['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
    return ids
      .map((id) => {
        const name = execFileSync(
          'docker',
          ['inspect', '-f', '{{.Name}} {{.State.Status}} exit={{.State.ExitCode}}', id],
          {
            encoding: 'utf8',
          },
        ).trim();
        const logs = execFileSync('docker', ['logs', '--tail', '60', id], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        return `--- ${name}\n${logs}`;
      })
      .join('\n');
  } catch (err) {
    return `(no container logs: ${err instanceof Error ? err.message : String(err)})`;
  }
}

const openApp = (appId: string) => openHost(`${appId}.hlabs.local`);

async function appState(appId: string) {
  const res = await query<{ state: string; stateDetail: unknown }>('apps.get', { appId });
  return res.result?.data ?? null;
}

/** One app through its whole life; returns what went wrong, or null. */
async function run(appId: string): Promise<string | null> {
  const details = await query<{ app: unknown } & StoreDetails>('store.getApp', { appId });
  if (!details.result) return `not in the store: ${JSON.stringify(details.error)}`;
  const d = details.result.data;
  const mounts = d.folders.flatMap((f) =>
    f.default?.storageLocationId
      ? [{ target: f.key, storageLocationId: f.default.storageLocationId, subpath: f.default.subpath, mode: f.mode }]
      : [],
  );
  // Settings the install sheet would ask for: their defaults, or a value that fits.
  const env = Object.fromEntries(
    d.install.env.filter((p) => p.required).map((p) => [p.key, p.default ?? p.options?.[0] ?? 'hlabs-matrix']),
  );

  log(appId, 'installing');
  const install = await mutate('apps.install', { appId, env, mounts, acceptRisks: true });
  if (install.error) return `install refused: ${JSON.stringify(install.error)}`;
  const installed = await until(`${appId} installed`, INSTALL_MS, async () => {
    const s = await appState(appId);
    return s && (s.state === 'running' || s.state === 'install_failed') ? s : undefined;
  });
  if (installed.state !== 'running') {
    say(containerLogs(appId));
    return `install failed: ${JSON.stringify(installed.stateDetail)}`;
  }

  log(appId, 'opening', `https://${appId}.hlabs.local:${PORTS.https}/`);
  const opened = await until(`${appId} answers`, SETTLE_MS, async () => {
    const page = await openApp(appId);
    return page.status >= 502 && page.status <= 504 ? undefined : page;
  });
  if (opened.status >= 500) return `opened with ${opened.status}`;
  if (opened.location?.includes('/login')) {
    if (!opened.location.includes(`${appId}.hlabs.local`) && /hlabs\.local[:/]/.test(opened.location)) {
      return `sent to the hlabs login instead of the app (${opened.location})`;
    }
  }
  log(appId, 'opened', opened.status, opened.location ?? '');

  log(appId, 'restarting');
  const restart = await mutate('apps.restart', { appId });
  if (restart.error) return `restart refused: ${JSON.stringify(restart.error)}`;
  const restarted = await until(`${appId} restarted`, SETTLE_MS, async () => {
    const s = await appState(appId);
    return s && (s.state === 'running' || s.state === 'error') ? s : undefined;
  });
  if (restarted.state !== 'running') {
    say(containerLogs(appId));
    return `restart failed: ${JSON.stringify(restarted.stateDetail)}`;
  }

  log(appId, 'uninstalling');
  const uninstall = await mutate('apps.uninstall', { appId, keepData: false });
  if (uninstall.error) return `uninstall refused: ${JSON.stringify(uninstall.error)}`;
  await until(`${appId} uninstalled`, SETTLE_MS, async () => ((await appState(appId)) === null ? true : undefined));
  return null;
}

async function main() {
  const all = readdirSync(join(REPO, 'store', 'apps')).filter((id) =>
    existsSync(join(REPO, 'store', 'apps', id, 'hlabs-app.yml')),
  );
  const wanted = process.argv.slice(2);
  const ids = wanted.length ? wanted : all;
  const unknown = ids.filter((id) => !all.includes(id));
  if (unknown.length) throw new Error(`not in store/apps: ${unknown.join(', ')}`);

  const daemon = startDaemon();
  const stop = () => {
    try {
      process.kill(-daemon.pid!, 'SIGTERM');
    } catch {
      // Already gone.
    }
  };
  process.on('SIGINT', () => {
    stop();
    process.exit(130);
  });
  const results: Array<[string, string | null]> = [];
  try {
    await until('the daemon', 120_000, async () => ((await fetch(`${DAEMON}/healthz`)).ok ? true : undefined));
    const seed = await fetch(`${DAEMON}/dev/seed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'matrix', displayName: 'Matrix', password: 'store matrix check', ports: PORTS }),
    });
    if (!seed.ok) throw new Error(`seed failed: ${seed.status} ${await seed.text()}`);
    await signIn();
    await until('Caddy on the dashboard', 60_000, async () => {
      const page = await openHost('hlabs.local').catch(() => null);
      return page ? true : undefined;
    }).catch(() => undefined);

    for (const id of ids) {
      const problem = await run(id).catch((err: unknown) => (err instanceof Error ? err.message : String(err)));
      results.push([id, problem]);
      log(id, problem ? `FAILED: ${problem}` : 'ok');
      if (problem) {
        // Leave nothing behind for the next app.
        await mutate('apps.uninstall', { appId: id, keepData: false }).catch(() => undefined);
        await until(`${id} gone`, SETTLE_MS, async () => ((await appState(id)) === null ? true : undefined)).catch(
          () => undefined,
        );
      }
    }
  } finally {
    stop();
  }
  say('\nStore matrix');
  for (const [id, problem] of results) say(`  ${problem ? '✗' : '✓'} ${id}${problem ? ` — ${problem}` : ''}`);
  if (results.some(([, problem]) => problem)) process.exit(1);
}

await main();
