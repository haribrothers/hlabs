// US-SYS-23 · Update hlabs (main instance, signed in as an admin). The e2e daemon never finds an update (its manifest
// is a closed local port), so the page is told about one here; "Update now" then reaches the real daemon, which
// refuses: there is no newer version to install.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-SYS-23 an available update shows its notes and "Update now"', async ({ page }) => {
  await page.route(/\/trpc\/[^?]*settings\.updates\.get/, async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as Array<{ result: { data: Record<string, unknown> } }>;
    body[0]!.result.data.available = {
      version: '99.0.0',
      notes: ['Faster app installs'],
      url: 'https://github.com/haribrothers/hlabs/releases/tag/v99.0.0',
    };
    await route.fulfill({ response: res, json: body });
  });
  await page.goto('/settings/updates');
  // The first visit can wait on the dev server compiling the page.
  await expect(page.getByRole('heading', { name: 'hlabs 99.0.0 is available' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^You have .+\. Apps restart for about a minute\.$/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Full release notes' })).toHaveAttribute('target', '_blank');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Update now' }).click();
  await expect(page.getByText('There is no newer version to install.')).toBeVisible({ timeout: 15_000 });
});
