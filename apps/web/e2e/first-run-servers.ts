// Global setup: one first-run hlabs per Playwright worker (daemon + Vite on their own ports, fresh data dir), so the
// onboarding, log-in and account specs can run in parallel. Returns the teardown that stops them.
import { spawn, type ChildProcess } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FullConfig } from '@playwright/test';
import { firstRunPorts } from './instances';

const WEB_DIR = resolve(import.meta.dirname, '..');
const ROOT = resolve(WEB_DIR, '../..');

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
  const count = config.workers;
  const children: ChildProcess[] = [];
  const start = (command: string, args: string[], cwd: string, env: Record<string, string>) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: 'ignore', detached: true });
    children.push(child);
  };
  await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const ports = firstRunPorts(i);
      const dataDir = resolve(ROOT, `.e2e-data-first-run-${i}`);
      await rm(dataDir, { recursive: true, force: true });
      start('pnpm', ['--filter', '@hlabs/daemon', 'exec', 'tsx', 'src/main.ts'], ROOT, {
        NODE_ENV: 'development',
        HLABS_DEV_NO_ENGINE_INSTALL: '1',
        HLABS_DEV_ANONYMOUS_ADMIN: '1',
        HLABS_LOG_LEVEL: 'warn',
        HLABS_PORT: String(ports.daemon),
        HLABS_DATA_DIR: dataDir,
        HLABS_DASHBOARD_URL: `http://127.0.0.1:${ports.web}`,
      });
      start('pnpm', ['exec', 'vite', '--port', String(ports.web)], WEB_DIR, {
        HLABS_DAEMON_URL: `http://127.0.0.1:${ports.daemon}`,
      });
      await waitFor(`http://127.0.0.1:${ports.daemon}/healthz`);
      await waitFor(`http://127.0.0.1:${ports.web}`);
    }),
  );
  return async () => {
    for (const child of children) {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGTERM');
      } catch {
        // Already gone.
      }
    }
  };
}
