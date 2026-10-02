// US-STORE-06 · See an app's details before installing (main instance, admin, built-in store).
import { expect, test } from '@playwright/test';

test('US-STORE-06 details show the app, its facts and Install; "App Store" goes back to the list', async ({ page }) => {
  await page.goto('/store/category/files');
  await page.getByRole('list', { name: 'Files & photos' }).getByRole('link', { name: 'Immich', exact: true }).click();
  await expect(page).toHaveURL(/\/store\/app\/immich$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Immich' })).toBeVisible();
  await expect(page.getByText('hlabs official')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Install', exact: true })).toBeVisible();

  const facts = page.getByLabel('About this app');
  await expect(facts.getByText('Version')).toBeVisible();
  await expect(facts.getByText(/^\d+ containers · server/)).toBeVisible();
  await expect(facts.getByText(/^immich\.[a-z0-9-]+\.local$/)).toBeVisible();
  await expect(facts.getByText('Photo library')).toBeVisible();

  await page.getByRole('link', { name: 'App Store' }).click();
  await expect(page).toHaveURL(/\/store\/category\/files$/);
});

test('US-STORE-06 back from details returns to the same scroll position', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'The phone store is long enough to scroll with the built-in apps');
  // On a phone the page scrolls inside <main>.
  await page.goto('/store');
  const row = page.getByRole('list', { name: 'Popular with families' });
  const card = row.getByRole('link', { name: 'Uptime Kuma', exact: true });
  await card.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => document.getElementById('main')!.scrollTop);
  expect(before).toBeGreaterThan(100);
  await card.click();
  await expect(page).toHaveURL(/\/store\/app\/uptime-kuma$/);
  await page.getByRole('link', { name: 'App Store' }).click();
  await expect(page).toHaveURL(/\/store$/);
  await expect.poll(() => page.evaluate(() => document.getElementById('main')!.scrollTop)).toBe(before);
});

test('US-STORE-06 details is a full-height window: only its content scrolls, never the page', async ({ page }) => {
  await page.goto('/store/app/immich');
  await expect(page.getByRole('heading', { level: 1, name: 'Immich' })).toBeVisible();
  const layout = await page.evaluate(() => {
    const main = document.getElementById('main')!;
    const window_ = document.querySelector('main section.hl-glass-2') as HTMLElement;
    const pane = window_.querySelector('.hl-scroll-pane-scroller') as HTMLElement;
    return {
      pageScrolls: document.documentElement.scrollHeight > innerHeight + 1,
      mainScrolls: main.scrollHeight > main.clientHeight + 1,
      paneScrollsItself: getComputedStyle(pane).overflowY !== 'visible',
      // The window reaches down to the Dock or tab bar (the space main keeps for it).
      gapToBottom: innerHeight - window_.getBoundingClientRect().bottom,
    };
  });
  expect(layout.pageScrolls).toBe(false);
  expect(layout.mainScrolls).toBe(false);
  expect(layout.paneScrollsItself).toBe(true);
  expect(layout.gapToBottom).toBeLessThan(200);
});
