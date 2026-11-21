// US-SITE-13 · Read release notes (the fixture's notes: 0.7.0-beta.1, 0.6.0 and 0.5.0).
import { expect, test } from '@playwright/test';

test.describe('US-SITE-13', () => {
  test('lists each version newest first, with its date, channel and sections', async ({ page }) => {
    await page.goto('/releases/');
    const versions = await page.locator('article[data-channel] .ver').allTextContents();
    expect(versions).toEqual(['0.7.0-beta.1', '0.6.0', '0.5.0']);

    const stable = page.locator('article[id="0.6.0"]');
    await expect(stable.locator('time')).toHaveText('18 November 2026');
    await expect(stable).toContainText('Stable');
    await expect(stable.getByRole('heading', { name: 'hlabs on Linux, and a proper Mac installer' })).toBeVisible();
    for (const section of ['New', 'Improved', 'Fixed', 'Before you update']) {
      await expect(stable.getByRole('heading', { name: section, exact: true })).toBeVisible();
    }
    const beta = page.locator('article[id="0.7.0-beta.1"]');
    await expect(beta).toContainText('Beta');
    // No title in its front matter: the version is its heading.
    await expect(beta.getByRole('heading', { name: 'hlabs 0.7.0-beta.1' })).toBeVisible();
  });

  test('"What\'s new" links land on the version', async ({ page }) => {
    await page.goto('/releases/#0.6.0');
    await expect(page.locator('article[id="0.6.0"]')).toBeInViewport();
  });

  test('can show only stable or only beta releases', async ({ page }) => {
    await page.goto('/releases/');
    await page.getByRole('button', { name: 'Beta' }).click();
    await expect(page.locator('article[id="0.6.0"]')).toBeHidden();
    await expect(page.locator('article[id="0.7.0-beta.1"]')).toBeVisible();
    await page.getByRole('button', { name: 'Stable' }).click();
    await expect(page.locator('article[id="0.7.0-beta.1"]')).toBeHidden();
    await expect(page.locator('article[id="0.5.0"]')).toBeVisible();
  });
});
