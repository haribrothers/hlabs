// US-PHONE-04 · Back navigation and resuming after the phone sleeps (main instance): Back closes the install sheet and
// search; Back from app details shows the store where it was scrolled; details' "App Store" is Back; and a tab shown
// again opens the event stream again within 2 s and refetches. (A session that ended while asleep and the 10 s
// "Can't reach hlabs" are the unit tests' and US-STATE-04's: this instance answers every request as its admin.)
import { expect, test, type Page } from '@playwright/test';
import { MAIN_URL } from './instances';
import { phoneOnly } from './phone';

async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test('US-PHONE-04 Back closes the install sheet and search', async ({ page }, info) => {
  phoneOnly(info);
  await page.goto('/store/app/audiobookshelf');
  await page.getByRole('main').getByRole('button', { name: 'Install', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /Install Audiobookshelf/ })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page).toHaveURL(`${MAIN_URL}/store/app/audiobookshelf`);

  await page.goto('/');
  await page.getByRole('main').getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Search' })).toBeHidden();
  await expect(page).toHaveURL(`${MAIN_URL}/`);
});

test('US-PHONE-04 Back from details shows the store where it was; "App Store" does the same', async ({
  page,
}, info) => {
  phoneOnly(info);
  await page.goto('/store');
  const main = page.locator('#main');
  const row = page.getByRole('main').locator('.hl-p-li-text').last();
  await expect(row).toBeVisible();
  await main.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const scrolled = await main.evaluate((el) => el.scrollTop);
  // Tapped where it is: Playwright's click would first scroll the row out from under the tab bar, so the page would leave
  // from another place than the one measured.
  const tap = () => row.evaluate((el) => (el as HTMLElement).click());
  const details = () => page.getByRole('main').getByRole('button', { name: 'App Store' });
  await tap();
  await expect(page).toHaveURL(/\/store\/app\//);
  // Back once the details are on screen, as a person would: the address changes before the page has drawn.
  await expect(details()).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(`${MAIN_URL}/store`);
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBe(scrolled);

  await tap();
  await expect(page).toHaveURL(/\/store\/app\//);
  await expect(details()).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'App Store' }).click();
  await expect(page).toHaveURL(`${MAIN_URL}/store`);
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBe(scrolled);
});

test('US-PHONE-04 shown again, the event stream reconnects within 2 s and what is on screen refetches', async ({
  page,
}, info) => {
  phoneOnly(info);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await page.waitForTimeout(500);
  await setHidden(page, true);
  const stream = page.waitForRequest((r) => r.url().includes('/trpc/events.stream'), { timeout: 2_000 });
  const refetch = page.waitForRequest((r) => /\/trpc\/[^?]*apps\.list/.test(r.url()), { timeout: 2_000 });
  await setHidden(page, false);
  await stream;
  await refetch;
});
