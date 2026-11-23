// Helpers for the phone layout's specs (12-phone.md): they run in the phone projects only.
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

/** Skips a spec outside the phone projects (phone, first-run-phone). */
export function phoneOnly(info: TestInfo) {
  test.skip(!info.project.name.includes('phone'), 'The phone layout (12-phone.md)');
}

export const tabBar = (page: Page) => page.getByRole('navigation', { name: 'Tab bar' });

/** The element's box, which must exist. */
export async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, 'element has a box').not.toBeNull();
  return b!;
}

/** At least 44 × 44 CSS px. */
export async function expectTouchTarget(locator: Locator) {
  const b = await box(locator);
  // Sub-pixel layout can measure a 44px box as 43.99997px.
  expect(Math.round(b.width), 'hit area width').toBeGreaterThanOrEqual(44);
  expect(Math.round(b.height), 'hit area height').toBeGreaterThanOrEqual(44);
}

/** A finger held on `locator` for `ms` (touch events, as a phone sends them). */
export async function longPress(page: Page, locator: Locator, ms = 650) {
  const b = await box(locator);
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/**
 * Home's greeting: the h1 on a computer; on a phone the line under the "Home" title (D-172), which ends in a full
 * stop ("Good evening, Hari. All 3 apps are running."). `name` is matched against the greeting itself.
 */
export function homeGreeting(scope: Page | Locator, info: TestInfo, name: RegExp | string) {
  if (!info.project.name.includes('phone')) return scope.getByRole('heading', { level: 1, name });
  const source =
    typeof name === 'string' ? name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : name.source.replace(/\$$/, '');
  return scope.locator('.hl-p-subtitle').filter({ hasText: new RegExp(`${source.replace(/^\^/, '')}\\.`) });
}
