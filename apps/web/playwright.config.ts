import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

type WebServer = Extract<NonNullable<PlaywrightTestConfig['webServer']>, readonly unknown[]>[number];
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  DOCS_CLOCK,
  DOCS_DAEMON_URL,
  DOCS_DEVICES,
  DOCS_HOME,
  DOCS_PORTS,
  DOCS_STORAGE_STATE,
  DOCS_URL,
  E2E_STORE_DIR,
  MAIN_PORTS,
  MAIN_STORAGE_STATE,
  MAIN_URL,
  PWA_PORT,
  PWA_URL,
} from './e2e/instances';

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
// Public apps (US-SYS-43, 44, US-APP-27…29) too: each sets up the pretend Cloudflare for its own instance and needs an
// admin with two-factor on.
const FIRST_RUN_SPECS =
  /(d-098-server-name|us-(onb|auth)-\d+|us-phone-0[56]|us-acct-(0[3-9]|1[0-24-9]|2[0678]|3[2-5])|us-home-(1[1256]|22)|us-sys-(0[2-6]|1[89]|20|3[178]|41|4[34])|us-app-2[789])\.spec\.ts/;
// Specs that change the main instance for everyone, run after the desktop and phone specs, one at a time: those that
// really install store apps (the D-071 smoke set, and uninstalling one) or leave failed installs, and those that report
// the engine as stopped (US-STATE-08…10), those that take the pretend NAS offline (US-FILE-11, US-FILE-12, US-SYS-12),
// the backup specs, which keep their repository on it (US-BKP-08, US-BKP-20), and those that change the instance's
// unused images or empty everyone's trash (US-SYS-13, US-SYS-14), and Beta updates, which changes the update channel
// (US-SYS-30). Restart hlabs and the factory reset (US-SYS-31, 37, 38) run on first-run instances only.
const SERIAL_SPECS =
  /(us-store-1[1-4]|us-store-17-rollback|us-app-(?:12|1[3-8]|24|26)|us-state-(0[89]|10)|us-file-1[12]|us-bkp-(08|20)|us-sys-(1[234]|30))\.spec\.ts/;
// The installable dashboard's specs (US-INST-28, US-INST-29, and US-PHONE-23 and 24's) run against a production build,
// where its manifest and service worker exist.
const PWA_SPECS = /(us-inst-2[89]|us-phone-2[34]-pwa)\.spec\.ts/;
// Tablets (14-tablet.md, D-175): the desktop layout by touch, on an iPad's screen, in the tablet project only.
const TABLET_SPECS = /us-tab-\d+\.spec\.ts/;
/** An iPad Pro 11" in landscape (1180 × 820) with a touch screen and no mouse: `(hover: none) and (pointer: coarse)`. */
// Chromium, like the other projects (Playwright's iPad is WebKit's): it emulates touch and the media queries the same.
const { defaultBrowserType: _webkit, ...ipad } = devices['iPad Pro 11 landscape'];
const IPAD = { ...ipad, viewport: { width: 1180, height: 820 }, browserName: 'chromium' as const };
/** That build takes a while: made only when the pwa project runs, or every project does (no --project given). */
const ARGV = process.argv.join(' ');
const PWA_RUN = !/--project[= ]/.test(ARGV) || /--project[= ]pwa\b/.test(ARGV);
// The docs screenshots (US-SITE-11, D-177): e2e/docs-shots, on an instance of their own with the demo data set, only
// when asked for (`--project=docs-shots`, on its own): a plain run never takes them or starts that instance.
const DOCS_SPECS = /docs-shots\//;
// Workers don't get the command line: the main process tells them through the environment.
const DOCS_RUN = process.env.HLABS_DOCS_SHOTS === '1' || /--project[= ]docs-shots\b/.test(ARGV);
if (DOCS_RUN) process.env.HLABS_DOCS_SHOTS = '1';
if (DOCS_RUN && process.env.TEST_WORKER_INDEX === undefined) {
  // A fresh docs instance every run (its clock starts on the same morning). Only ever this folder.
  if (!DOCS_HOME.endsWith('/.e2e-data-docs/home')) throw new Error(`unexpected docs data dir ${DOCS_HOME}`);
  rmSync(dirname(DOCS_HOME), { recursive: true, force: true });
  mkdirSync(DOCS_HOME, { recursive: true });
}
/** What every docs screenshot is taken with: the same language, time zone and pixels on any machine. */
const DOCS_USE = {
  browserName: 'chromium' as const,
  locale: 'en-GB',
  timezoneId: 'UTC',
  colorScheme: 'light' as const,
  reducedMotion: 'reduce' as const,
  deviceScaleFactor: 1,
  baseURL: DOCS_URL,
};
// CI runs each project in a job of its own (HLABS_E2E_SPLIT, .github/workflows/ci.yml): the serial specs then have a
// main instance to themselves and needn't wait for the desktop and phone specs.
const SPLIT = !!process.env.HLABS_E2E_SPLIT;

// HLABS_DEV_NO_ENGINE_INSTALL: a run on a machine with no engine must never download Colima (11: tests don't
// reach the internet).
const daemonEnv = {
  NODE_ENV: 'development',
  HLABS_DEV_NO_ENGINE_INSTALL: '1',
  HLABS_DEV_NO_ENGINE_CONTROL: '1',
  // A pretend Tailscale: e2e never touches the real one (CI has none).
  HLABS_DEV_FAKE_TAILSCALE: '1',
  // A pretend Cloudflare: public apps (US-SYS-43…) never reach Cloudflare; set up through POST /dev/cloudflare.
  HLABS_DEV_FAKE_CLOUDFLARE: '1',
  // A pretend NAS (nas.local): e2e connects network drives without one (US-FILE-11, US-FILE-12).
  HLABS_DEV_FAKE_NAS: '1',
  // Update checks go to a closed local port, never GitHub: "Check now" answers "Couldn't check for updates".
  HLABS_UPDATE_ENDPOINT: 'http://127.0.0.1:9/{channel}.json',
  HLABS_DEV_ANONYMOUS_ADMIN: '1',
  HLABS_LOG_LEVEL: 'warn',
  // Its own compose projects, never a dev instance's apps (D-090).
  HLABS_COMPOSE_PREFIX: 'hlabs-e2e',
};

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  workers: WORKERS,
  // The docs screenshots need none of the first-run instances.
  globalSetup: DOCS_RUN ? undefined : './e2e/first-run-servers.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: MAIN_URL, trace: 'retain-on-failure' },
  projects: [
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    // The installable dashboard, against a production build (US-INST-28, US-INST-29).
    {
      name: 'pwa',
      testMatch: PWA_SPECS,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: MAIN_STORAGE_STATE,
        baseURL: PWA_URL,
      },
      dependencies: ['setup'],
    },
    {
      name: 'desktop',
      testIgnore: [FIRST_RUN_SPECS, SERIAL_SPECS, PWA_SPECS, TABLET_SPECS, DOCS_SPECS],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: MAIN_STORAGE_STATE },
      dependencies: ['setup'],
    },
    {
      name: 'phone',
      testIgnore: [FIRST_RUN_SPECS, SERIAL_SPECS, PWA_SPECS, TABLET_SPECS, DOCS_SPECS],
      use: { ...devices['Pixel 7'], storageState: MAIN_STORAGE_STATE },
      dependencies: ['setup'],
    },
    // An iPad by touch, landscape; its specs turn it upright (820 × 1180) where they test portrait (US-TAB-05).
    {
      name: 'tablet',
      testMatch: TABLET_SPECS,
      use: { ...IPAD, storageState: MAIN_STORAGE_STATE },
      dependencies: ['setup'],
    },
    {
      name: 'serial',
      testMatch: SERIAL_SPECS,
      // One at a time across files too: they install apps or stop the engine for everyone.
      workers: 1,
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: MAIN_STORAGE_STATE },
      dependencies: SPLIT ? ['setup'] : ['desktop', 'phone', 'tablet'],
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
    // The docs screenshots (US-SITE-11): the setup shoots onboarding, seeds the demo data set and signs Hari in; each
    // spec then sets its layout (e2e/docs-shots/*.spec.ts).
    ...(DOCS_RUN
      ? [
          {
            name: 'docs-setup',
            testMatch: /docs-shots\/demo\.setup\.ts/,
            // It shoots a fresh instance's setup screens and seeds it: a second try would find it set up.
            retries: 0,
            use: { ...DOCS_USE, ...DOCS_DEVICES.desktop },
          },
          {
            name: 'docs-shots',
            testMatch: /docs-shots\/.*\.spec\.ts/,
            // The live charts keep a page busy: a screenshot may take a while.
            timeout: 90_000,
            // One at a time: they share the demo instance and some change it (and put it back).
            workers: 1,
            fullyParallel: false,
            use: { ...DOCS_USE, storageState: DOCS_STORAGE_STATE },
            dependencies: ['docs-setup'],
          },
        ]
      : []),
  ],
  webServer: DOCS_RUN ? docsServers() : mainServers(),
});

/** The docs instance (US-SITE-11, D-177): the demo computer in a pretend home, on its fixed clock. */
function docsServers(): WebServer[] {
  return [
    {
      // tsx itself (not through pnpm), in the pretend home: ~/hlabs is .e2e-data-docs/home/hlabs.
      command: `${resolve(import.meta.dirname, '../daemon/node_modules/.bin/tsx')} src/main.ts`,
      cwd: resolve(import.meta.dirname, '../daemon'),
      url: `${DOCS_DAEMON_URL}/healthz`,
      reuseExistingServer: false,
      env: {
        ...daemonEnv,
        HOME: DOCS_HOME,
        TZ: 'UTC',
        HLABS_DEV_DEMO: '1',
        HLABS_DEV_CLOCK: DOCS_CLOCK,
        HLABS_PORT: String(DOCS_PORTS.daemon),
        HLABS_DATA_DIR: `${DOCS_HOME}/hlabs`,
        HLABS_DASHBOARD_URL: DOCS_URL,
        HLABS_COMPOSE_PREFIX: 'hlabs-docs',
      },
      timeout: 120_000,
    },
    {
      command: `pnpm exec vite --port ${DOCS_PORTS.web} --strictPort`,
      url: DOCS_URL,
      reuseExistingServer: false,
      env: { HLABS_DAEMON_URL: DOCS_DAEMON_URL },
      timeout: 120_000,
    },
  ];
}

function mainServers(): WebServer[] {
  return [
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
    // The same dashboard built for production, in its own folder, for the pwa project; only when that project runs.
    ...(PWA_RUN
      ? [
          {
            command: `pnpm exec vite build --outDir dist-pwa --emptyOutDir && pnpm exec vite preview --outDir dist-pwa --port ${PWA_PORT} --strictPort`,
            url: PWA_URL,
            reuseExistingServer: !process.env.CI,
            env: { HLABS_DAEMON_URL: `http://127.0.0.1:${MAIN_PORTS.daemon}` },
            timeout: 180_000,
          },
        ]
      : []),
  ];
}
