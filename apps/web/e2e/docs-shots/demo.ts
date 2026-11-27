// Shared by the docs screenshot specs (US-SITE-11, D-177): the browser's clock set to the docs instance's, which starts
// on the same morning every run, so the greeting, "6 hours ago" and the charts' times don't change between runs.
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { DOCS_DAEMON_URL } from '../instances';

/** Stops the page's clock at the docs instance's time now (before the page loads). */
export async function freezeClock(page: Page, request: APIRequestContext) {
  const res = await request.get(`${DOCS_DAEMON_URL}/dev/clock`);
  expect(res.ok()).toBe(true);
  const { now } = (await res.json()) as { now: number };
  await page.clock.setFixedTime(now);
}
