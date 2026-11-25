// Global setup: one first-run hlabs per Playwright worker (daemon + Vite on their own ports, fresh data dir), so the
// onboarding, log-in and account specs can run in parallel. Returns the teardown that stops them.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FullConfig } from '@playwright/test';
import { firstRunPorts } from './instances';

const WEB_DIR = resolve(import.meta.dirname, '..');
const ROOT = resolve(WEB_DIR, '../..');
const DAEMON_DIR = resolve(ROOT, 'apps/daemon');
const TSX = resolve(DAEMON_DIR, 'node_modules/.bin/tsx');
/** hlabsd's "start me again" exit code (apps/daemon/src/system/lifecycle.ts). */
const RESTART_EXIT_CODE = 75;

async function waitFor(url: string, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${url} didn't come up`);
}

export default async function firstRunServers(config: FullConfig) {
  // The fallback page Caddy serves when the daemon is down (US-STATE-04), for its spec.
  execFileSync('pnpm', ['build:fallback'], { cwd: WEB_DIR, stdio: 'ignore' });
  const count = config.workers;
  const children: ChildProcess[] = [];
  let stopping = false;
  const start = (command: string, args: string[], cwd: string, env: Record<string, string>, respawn = false) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: 'ignore', detached: true });
    children.push(child);
    // As launchd and systemd do (D-133): hlabsd exiting with 75 (Restart hlabs, a factory reset) is started again.
    if (respawn) {
      child.on('exit', (code) => {
        if (code === RESTART_EXIT_CODE && !stopping) start(command, args, cwd, env, respawn);
      });
    }
  };
  await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const ports = firstRunPorts(i);
      const dataDir = resolve(ROOT, `.e2e-data-first-run-${i}`);
      await rm(dataDir, { recursive: true, force: true });
      // tsx itself, not through pnpm, so the daemon's exit code reaches the respawn above.
      start(
        TSX,
        ['src/main.ts'],
        DAEMON_DIR,
        {
          NODE_ENV: 'development',
          HLABS_DEV_NO_ENGINE_INSTALL: '1',
          HLABS_DEV_NO_ENGINE_CONTROL: '1',
          // A pretend Tailscale: e2e never touches the real one (CI has none).
          HLABS_DEV_FAKE_TAILSCALE: '1',
          // A pretend Cloudflare: public apps never reach Cloudflare.
          HLABS_DEV_FAKE_CLOUDFLARE: '1',
          HLABS_DEV_ANONYMOUS_ADMIN: '1',
          HLABS_LOG_LEVEL: 'warn',
          HLABS_COMPOSE_PREFIX: 'hlabs-e2e',
          HLABS_PORT: String(ports.daemon),
          HLABS_DATA_DIR: dataDir,
          HLABS_DASHBOARD_URL: `http://127.0.0.1:${ports.web}`,
          // Update checks (Beta updates turns one on) go to a closed local port, never GitHub.
          HLABS_UPDATE_ENDPOINT: 'http://127.0.0.1:9/{channel}.json',
        },
        true,
      );
      start('pnpm', ['exec', 'vite', '--port', String(ports.web)], WEB_DIR, {
        HLABS_DAEMON_URL: `http://127.0.0.1:${ports.daemon}`,
      });
      await waitFor(`http://127.0.0.1:${ports.daemon}/healthz`);
      await waitFor(`http://127.0.0.1:${ports.web}`);
    }),
  );
  return async () => {
    stopping = true;
    for (const child of children) {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGTERM');
      } catch {
        // Already gone.
      }
    }
  };
}
