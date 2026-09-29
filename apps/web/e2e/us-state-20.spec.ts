// US-STATE-20 · Signed-out and forbidden answers go to the right place. Playwright answers the calls, so the
// signed-in admin's real session and settings are untouched.
import { expect, test, type Route } from '@playwright/test';

const trpcError = (route: Route, status: number, code: string, hlabsCode: string) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify([
      { error: { message: hlabsCode, code: -32000, data: { code, httpStatus: status, hlabsCode, detail: null } } },
    ]),
  });

test('US-STATE-20 a page whose query is FORBIDDEN shows "You don\'t have access to this" at the same URL', async ({
  page,
}, testInfo) => {
  await page.route('**/trpc/settings.engine.get**', (route) => trpcError(route, 403, 'FORBIDDEN', 'ACCESS_DENIED'));
  await page.goto('/settings/engine');
  const card = page.getByRole('heading', { name: "You don't have access to this" });
  await expect(card).toBeVisible();
  await expect(page.getByText('Ask an admin if you need it.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to Home' })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/settings/engine');
  await expect(page).toHaveTitle('No access · hlabs');
  if (testInfo.project.name === 'phone') {
    await expect(page.getByTestId('tab-bar')).toBeVisible();
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('US-STATE-20 an unknown address shows "Page not found" with Go to Home, never a redirect', async ({ page }) => {
  await page.goto('/no/such/page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to Home' })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/no/such/page');
});

test('US-STATE-20 a FORBIDDEN mutation is one danger toast and the switch stays as it was', async ({ page }) => {
  await page.goto('/settings/engine');
  const keepAwake = page.getByRole('switch', { name: /Keep this computer awake/ });
  await expect(keepAwake).toBeVisible();
  const before = await keepAwake.getAttribute('aria-checked');
  await page.route('**/trpc/settings.startup.update**', (route) => trpcError(route, 403, 'FORBIDDEN', 'ACCESS_DENIED'));
  await keepAwake.click();
  await expect(page.getByRole('alert').filter({ hasText: "You don't have access to that." })).toHaveCount(1);
  await expect(page.getByText("Couldn't save that. Try again.")).toHaveCount(0);
  await expect(keepAwake).toHaveAttribute('aria-checked', before!);
});

test('US-STATE-20 UNAUTHORIZED goes to log in with the page to come back to', async ({ page }) => {
  await page.goto('/settings/engine');
  await expect(page.getByRole('heading', { name: 'Engine & startup' })).toBeVisible();
  await page.route('**/trpc/**', (route) =>
    route.request().url().includes('events.stream')
      ? route.continue()
      : trpcError(route, 401, 'UNAUTHORIZED', 'AUTH_REQUIRED'),
  );
  // Coming back to the window refetches who's signed in, which now answers 401.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)settings(%2F|\/)engine/);
});
