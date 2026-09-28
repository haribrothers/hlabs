// The two e2e instances (see playwright.config.ts).
import { expect, type APIRequestContext } from '@playwright/test';

export const MAIN_URL = 'http://127.0.0.1:5173';
/** The main instance's signed-in browser state, written by global.setup.ts. */
export const MAIN_STORAGE_STATE = 'e2e/.auth/main.json';
/** A hlabs that has not been set up; its data dir is wiped at the start of every run. */
export const FIRST_RUN_URL = 'http://127.0.0.1:5174';

type Step = 'welcome' | 'system' | 'account' | 'twoFactor' | 'storage' | 'done';

/** Puts the first-run instance back at `step` (not completed) and returns its setup URL. */
export async function resetOnboarding(request: APIRequestContext, step: Step = 'welcome'): Promise<string> {
  const res = await request.post(`${FIRST_RUN_URL}/dev/reset-onboarding`, { data: { step } });
  expect(res.ok()).toBe(true);
  const { url } = (await res.json()) as { url: string };
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:5174\/setup\?token=[A-Za-z0-9_-]{43}$/);
  return url;
}
