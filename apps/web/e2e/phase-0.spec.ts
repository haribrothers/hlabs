// Phase 0 "Done when" (docs/prd/10-phases.md): the Home shell renders with a working Dock (desktop)
// and tab bar (phone); /healthz is 200; events.stream delivers a test event to the browser.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Areas whose phase hasn't shipped are hidden (D-036, US-HOME-04). The e2e dev server previews the phase being
// built (D-092): from phase 4, Home, App Store, Usage and Settings, then Search in the Dock.
const AREAS = ['Home', 'App Store', 'Usage', 'Settings'];
// The phone tab bar's shorter names (D-054).
const TABS = ['Home', 'Apps', 'Usage', 'Settings'];

test('GET /healthz returns 200 when the daemon is ready', async ({ request }) => {
  const res = await request.get('/healthz');
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ status: 'ok' });
});

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop layout');

  test('the Dock shows the shipped areas and moves between them', async ({ page }) => {
    await page.goto('/');
    const dock = page.getByRole('navigation', { name: 'Dock' });
    await expect(dock).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Tab bar' })).toBeHidden();
    await expect(dock.getByRole('button')).toHaveCount(AREAS.length + 1);
    await expect(dock.getByRole('button', { name: 'Search' })).toBeVisible();
    for (const area of AREAS) await expect(dock.getByRole('button', { name: area })).toBeVisible();
    await expect(dock.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');

    await dock.getByRole('button', { name: 'Settings' }).click();
    // Settings opens on Account on a desktop (US-ACCT-01).
    await expect(page).toHaveURL(/\/settings\/account$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
    await expect(dock.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  });

  test('the Dock works from the keyboard', async ({ page }) => {
    await page.goto('/');
    const dock = page.getByRole('navigation', { name: 'Dock' });
    await dock.getByRole('button', { name: 'Home' }).focus();
    await page.keyboard.press('End');
    await expect(dock.getByRole('button', { name: 'Search' })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(dock.getByRole('button', { name: 'Settings' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/settings\/account$/);
  });

  test('events.stream delivers a test event to the browser', async ({ page, request }) => {
    await page.goto('/dev/ui');
    await expect(page.getByTestId('stream-status')).toHaveText('Connected');
    const message = `e2e ${Date.now()}`;
    const res = await request.post('/dev/emit-test-event', { data: { message } });
    expect(res.ok()).toBe(true);
    await expect(page.getByTestId('last-event')).toContainText(message);
  });
});

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout');

  test('the tab bar shows the shipped tabs, fits the screen and moves between them', async ({ page }) => {
    await page.goto('/');
    const tabs = page.getByRole('navigation', { name: 'Tab bar' });
    await expect(tabs).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Dock' })).toBeHidden();
    await expect(tabs.getByRole('button')).toHaveText(TABS);
    const bar = (await tabs.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(bar.x).toBeGreaterThanOrEqual(0);
    expect(bar.x + bar.width).toBeLessThanOrEqual(viewport.width);
    await tabs.getByRole('button', { name: 'Settings' }).tap();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(tabs.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  });

  test('tab targets are at least 44px (08 accessibility)', async ({ page }) => {
    await page.goto('/');
    const box = await page
      .getByRole('navigation', { name: 'Tab bar' })
      .getByRole('button', { name: 'Home' })
      .boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });
});

for (const theme of ['glass', 'solid'] as const) {
  test(`axe finds no violations on Home and an area window (${theme})`, async ({ page }) => {
    for (const path of ['/', '/settings']) {
      await page.goto(path);
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await page.getByRole('navigation').first().waitFor();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    }
  });
}
