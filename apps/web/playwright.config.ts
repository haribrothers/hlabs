import { defineConfig, devices } from '@playwright/test';
import { MAIN_STORAGE_STATE } from './e2e/instances';

// E2E specs are named by user story id (us-<code>-<nn>.spec.ts); phase checks by phase.
// Locally they reuse a running `pnpm dev`; in CI Playwright starts the daemons and Vite itself.
//
// Instances:
// - main (daemon 7474, Vite 5173): onboarding is completed by e2e/global.setup.ts so specs reach the dashboard.
// - first run, one per worker (daemon 7480+i, Vite 5180+i, started by e2e/first-run-servers.ts): a fresh data dir on
//   every run, for specs that set hlabs up themselves (import FIRST_RUN_URL from e2e/instances.ts). With one each,
//   those specs run in parallel, desktop and phone at the same time.
const DATA_DIR = process.env.HLABS_E2E_DATA_DIR ?? '../../.e2e-data';
const WORKERS = process.env.CI ? 2 : 4;
// Specs that need a known admin they create themselves (all onboarding and log-in stories, and a few later ones).
const FIRST_RUN_SPECS = /(us-(onb|auth)-\d+|us-acct-(0[3-9]|1[0-2])|us-sys-(1[89]|20))\.spec\.ts/;

// HLABS_DEV_NO_ENGINE_INSTALL: a run on a machine with no engine must never download Colima (11: tests don't
// reach the internet).
const daemonEnv = {
  NODE_ENV: 'development',
  HLABS_DEV_NO_ENGINE_INSTALL: '1',
  HLABS_DEV_NO_ENGINE_CONTROL: '1',
  HLABS_DEV_ANONYMOUS_ADMIN: '1',
  HLABS_LOG_LEVEL: 'warn',
};

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  workers: WORKERS,
  globalSetup: './e2e/first-run-servers.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    {
      name: 'desktop',
      testIgnore: FIRST_RUN_SPECS,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: MAIN_STORAGE_STATE },
      dependencies: ['setup'],
    },
    {
      name: 'phone',
      testIgnore: FIRST_RUN_SPECS,
      use: { ...devices['Pixel 7'], storageState: MAIN_STORAGE_STATE },
      dependencies: ['setup'],
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
      url: 'http://127.0.0.1:7474/healthz',
      reuseExistingServer: !process.env.CI,
      env: { ...daemonEnv, HLABS_DATA_DIR: DATA_DIR, HLABS_DASHBOARD_URL: 'http://127.0.0.1:5173' },
      timeout: 60_000,
    },
    {
      command: 'pnpm exec vite --port 5173',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
