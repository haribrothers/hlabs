// US-STORE-04 · Browse a category (main instance, admin): Popular, New and A–Z re-sort at once and are remembered in
// this browser; the count line; Install opens the app's details.
import { expect, test } from '@playwright/test';

test('US-STORE-04 a category sorts by Popular, New or A–Z, remembered after a reload', async ({ page }) => {
  await page.goto('/store/category/media');
  const sorts = page.getByRole('radiogroup', { name: 'Sort apps' });
  await expect(sorts.getByRole('radio', { name: 'Popular' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(/^\d+ apps?( · (showing )?(Apple Silicon|ARM64) compatible first)?$/)).toBeVisible();
  if (process.env.HLABS_SHOTS)
    await page.screenshot({ path: `${process.env.HLABS_SHOTS}/store-category-${test.info().project.name}.png` });

  const list = page.getByRole('list', { name: 'Media' });
  // Each row's name link (on a phone the row also has its Install pill, and the link holds the tagline too).
  const names = () =>
    list
      .getByRole('listitem')
      .locator('a[href^="/store/app/"]:not(.hl-btn):not(.hl-p-get)')
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? el.textContent));
  // The daemon's A–Z (apps that run on this computer first on arm64).
  const input = encodeURIComponent(JSON.stringify({ category: 'media', sort: 'name' }));
  const reply = (await (await page.request.get(`/trpc/store.listApps?input=${input}`)).json()) as {
    result: { data: { items: Array<{ name: string }> } };
  };
  const expected = reply.result.data.items.map((a) => a.name);
  await sorts.getByRole('radio', { name: 'A–Z' }).click();
  await expect.poll(names).toEqual(expected);
  await page.reload();
  await expect(sorts.getByRole('radio', { name: 'A–Z' })).toHaveAttribute('aria-checked', 'true');
  // Back to the default for other runs in this browser.
  await sorts.getByRole('radio', { name: 'Popular' }).click();
});

test('US-STORE-04 Install opens the app’s details', async ({ page }) => {
  await page.goto('/store/category/media');
  const install = page.getByRole('link', { name: /^Install / }).first();
  const name = (await install.getAttribute('aria-label'))!.replace(/^Install /, '');
  await install.click();
  await expect(page).toHaveURL(/\/store\/app\/[a-z0-9-]+\?install=true$/);
  await expect(page.getByRole('dialog', { name: new RegExp(`Install ${name}`) })).toBeVisible();
});
