// The e2e instances (see playwright.config.ts).
import { resolve } from 'node:path';
import { devices, expect, type APIRequestContext } from '@playwright/test';

/**
 * The main instance has ports of its own, never `pnpm dev`'s (7474 and 5173): specs add and remove apps, so they must
 * only ever reach the e2e data dir, even while a dev instance with real apps is running.
 */
export const MAIN_PORTS = { daemon: 7574, web: 5273 } as const;
export const MAIN_URL = `http://127.0.0.1:${MAIN_PORTS.web}`;
/**
 * The main instance's dashboard as built for production (`vite build` and `vite preview`, proxying to its daemon):
 * the web manifest and service worker exist only in builds (US-INST-28, US-INST-29).
 */
export const PWA_PORT = 5373;
export const PWA_URL = `http://127.0.0.1:${PWA_PORT}`;
/** The main instance's signed-in browser state, written by global.setup.ts. */
export const MAIN_STORAGE_STATE = 'e2e/.auth/main.json';

/**
 * Each worker gets its own first-run hlabs (daemon and Vite), started by e2e/first-run-servers.ts with a fresh data
 * dir, so specs that reset it can run side by side. Playwright tells a worker its index in TEST_PARALLEL_INDEX.
 */
export const firstRunPorts = (index: number) => ({ daemon: 7480 + index, web: 5180 + index });

const workerIndex = Number(process.env.TEST_PARALLEL_INDEX ?? 0);
/** This worker's hlabs that has not been set up. */
export const FIRST_RUN_URL = `http://127.0.0.1:${firstRunPorts(workerIndex).web}`;

type Step = 'welcome' | 'system' | 'account' | 'twoFactor' | 'storage' | 'apps' | 'done';

/** Puts this worker's first-run instance back at `step` (not completed) and returns its setup URL. */
export async function resetOnboarding(request: APIRequestContext, step: Step = 'welcome'): Promise<string> {
  const res = await request.post(`${FIRST_RUN_URL}/dev/reset-onboarding`, { data: { step } });
  expect(res.ok()).toBe(true);
  const { url } = (await res.json()) as { url: string };
  expect(url.startsWith(`${FIRST_RUN_URL}/setup?token=`)).toBe(true);
  expect(url).toMatch(/\?token=[A-Za-z0-9_-]{43}$/);
  return url;
}

/**
 * The main instance's store: a copy of the built-in store made when Playwright starts, so a spec can add a test app
 * to it (the US-STORE-17 rollback) without touching store/ or other instances.
 */
export const E2E_STORE_DIR = resolve(process.env.HLABS_E2E_DATA_DIR ?? '../../.e2e-data', 'store');

/**
 * The docs screenshots' instance (US-SITE-11, D-177): its own daemon and Vite, started only for the docs-shots project
 * (`--project=docs-shots`), with a fresh data dir under a pretend home, the demo computer and engine (HLABS_DEV_DEMO)
 * and a clock that starts on the same morning every run (HLABS_DEV_CLOCK). Never a dev or e2e instance's data.
 */
export const DOCS_PORTS = { daemon: 7674, web: 5473 } as const;
export const DOCS_URL = `http://127.0.0.1:${DOCS_PORTS.web}`;
export const DOCS_DAEMON_URL = `http://127.0.0.1:${DOCS_PORTS.daemon}`;
/** The pretend home the docs instance runs in (`~/hlabs` is its data), removed when Playwright starts it. */
export const DOCS_HOME = resolve(import.meta.dirname, '../../../.e2e-data-docs/home');
/** Wednesday 14 October 2026, 09:41 UTC: "Good morning", and last night's backup at 03:00. */
export const DOCS_CLOCK = '2026-10-14T09:41:00Z';
/** The docs instance's signed-in browser state (Hari), written by e2e/docs-shots/demo.setup.ts. */
export const DOCS_STORAGE_STATE = 'e2e/.auth/docs.json';

/**
 * The browser each docs layout is shot in (D-177): a Mac's Chrome at 1440 × 900, a phone at 390 × 844 and an iPad by
 * touch at 1180 × 820 (D-175), one CSS pixel per pixel. A fixed user agent, so "Signed-in devices" reads the same on CI.
 */
export const DOCS_DEVICES = {
  desktop: {
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  },
  phone: {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: devices['Pixel 7'].userAgent,
  },
  tablet: {
    viewport: { width: 1180, height: 820 },
    isMobile: true,
    hasTouch: true,
    userAgent: devices['iPad Pro 11 landscape'].userAgent,
  },
} as const;
