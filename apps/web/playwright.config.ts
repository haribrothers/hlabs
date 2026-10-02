import { defineConfig, devices } from '@playwright/test';
import { cpSync, rmSync } from 'node:fs';
import { E2E_STORE_DIR, MAIN_PORTS, MAIN_STORAGE_STATE, MAIN_URL } from './e2e/instances';

// E2E specs are named by user story id (us-<code>-<nn>.spec.ts); phase checks by phase.
// Playwright starts the daemons and Vite itself, on ports of their own, so a running `pnpm dev` (and its data) is
// never touched; locally it reuses an e2e instance that's still up from a previous run.
//
// Instances:
// - main (daemon 7574, Vite 5273): onboarding is completed by e2e/global.setup.ts so specs reach the dashboard.
// - first run, one per worker (daemon 7480+i, Vite 5180+i, started by e2e/first-run-servers.ts): a fresh data dir on
//   every run, for specs that set hlabs up themselves (import FIRST_RUN_URL from e2e/instances.ts). With one each,
//   those specs run in parallel, desktop and phone at the same time.
const DATA_DIR = process.env.HLABS_E2E_DATA_DIR ?? '../../.e2e-data';
const WORKERS = process.env.CI ? 2 : 4;
// The main instance's own copy of the built-in store, fresh each run (no test app left from an earlier one). Only in
// Playwright's main process: every worker loads this file too, and must not wipe it while a spec is using it.
if (process.env.TEST_WORKER_INDEX === undefined) {
  rmSync(E2E_STORE_DIR, { recursive: true, force: true });
  cpSync('../../store', E2E_STORE_DIR, { recursive: true });
}
// Specs that need a known admin they create themselves (all onboarding and log-in stories, and a few later ones).
// Signed-out browsers need them too: the main instance answers cookie-less requests as its development admin.
const FIRST_RUN_SPECS =
  /(d-098-server-name|us-(onb|auth)-\d+|us-acct-(0[3-9]|1[0-24-9]|2[0678])|us-home-1[12]|us-sys-(0[2-6]|1[89]|20))\.spec\.ts/;
// Specs that change the main instance for everyone, run after the desktop and phone specs, one at a time: those that
// really install store apps (the D-071 smoke set, and uninstalling one) or leave failed installs, and those that report
// the engine as stopped (US-STATE-08…10).
const SERIAL_SPECS = /(us-store-1[1-4]|us-store-17-rollback|us-app-12|us-state-(0[89]|10))\.spec\.ts/;

// HLABS_DEV_NO_ENGINE_INSTALL: a run on a machine with no engine must never download Colima (11: tests don't
// reach the internet).
const daemonEnv = {
  NODE_ENV: 'development',
  HLABS_DEV_NO_ENGINE_INSTALL: '1',
  HLABS_DEV_NO_ENGINE_CONTROL: '1',
  // A pretend Tailscale: e2e never touches the real one (CI has none).
  HLABS_DEV_FAKE_TAILSCALE: '1',
  HLABS_DEV_ANONYMOUS_ADMIN: '1',
  HLABS_LOG_LEVEL: 'warn',
  // Its own compose projects, never a dev instance's apps (D-090).
  HLABS_COMPOSE_PREFIX: 'hlabs-e2e',
};

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  workers: WORKERS,
  globalSetup: './e2e/first-run-servers.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: MAIN_URL, trace: 'retain-on-failure' },
  projects: [
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    {
      name: 'desktop',
      testIgnore: [FIRST_RUN_SPECS, SERIAL_SPECS],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: MAIN_STORAGE_STATE },
      dependencies: ['setup'],
    },
    {
      name: 'phone',
      testIgnore: [FIRST_RUN_SPECS, SERIAL_SPECS],
      use: { ...devices['Pixel 7'], storageState: MAIN_STORAGE_STATE },
      dependencies: ['setup'],
    },
    {
      name: 'serial',
      testMatch: SERIAL_SPECS,
      // One at a time across files too: they install apps or stop the engine for everyone.
      workers: 1,
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: MAIN_STORAGE_STATE },
      dependencies: ['desktop', 'phone'],
    },
    // Each worker resets its own first-run instance, so these run in parallel.
    {
      name: 'first-run',
      testMatch: FIRST_RUN_SPECS,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'first-run-phone',
      testMatch: FIRST_RUN_SPECS,
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: [
    {
      command: `pnpm --filter @hlabs/daemon exec tsx src/main.ts`,
      url: `http://127.0.0.1:${MAIN_PORTS.daemon}/healthz`,
      reuseExistingServer: !process.env.CI,
      env: {
        ...daemonEnv,
        HLABS_PORT: String(MAIN_PORTS.daemon),
        HLABS_DATA_DIR: DATA_DIR,
        HLABS_DASHBOARD_URL: MAIN_URL,
        HLABS_STORE_DIR: E2E_STORE_DIR,
      },
      timeout: 60_000,
    },
    {
      command: `pnpm exec vite --port ${MAIN_PORTS.web} --strictPort`,
      url: MAIN_URL,
      reuseExistingServer: !process.env.CI,
      env: { HLABS_DAEMON_URL: `http://127.0.0.1:${MAIN_PORTS.daemon}` },
      timeout: 60_000,
    },
  ],
});
