// The e2e instances (see playwright.config.ts).
import { expect, type APIRequestContext } from '@playwright/test';

/**
 * The main instance has ports of its own, never `pnpm dev`'s (7474 and 5173): specs add and remove apps, so they must
 * only ever reach the e2e data dir, even while a dev instance with real apps is running.
 */
export const MAIN_PORTS = { daemon: 7574, web: 5273 } as const;
export const MAIN_URL = `http://127.0.0.1:${MAIN_PORTS.web}`;
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
