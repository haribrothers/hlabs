// US-SITE-03 · Browse the app catalogue, built from store/.
import { expect, test } from '@playwright/test';
import { accessibleInBothThemes, storeAppIds } from './helpers';

test.describe('US-SITE-03', () => {
  test('shows every app in the store with its logo, name, description and group, in the store’s order', async ({
    page,
  }) => {
    await page.goto('/apps/');
    const cards = page.locator('[data-group] a.app');
    const hrefs = await cards.evaluateAll((links) => links.map((l) => l.getAttribute('href')));
    expect([...hrefs].sort()).toEqual(storeAppIds().map((id) => `/apps/${id}/`));

    const immich = page.locator('[data-group] a.app[href="/apps/immich/"]');
    await expect(immich.locator('img')).toHaveAttribute('src', '/apps/immich/logo.svg');
    await expect(immich).toContainText('Immich');
    await expect(immich).toContainText('Back up every photo from your phone');
    // Groups follow the store's order (US-STORE-02): Media first, then Files & photos.
    const groups = await page.locator('[data-group] h2').allTextContents();
    expect(groups.slice(0, 2)).toEqual(['Media', 'Files & photos']);
    await expect(page.locator('[data-group="files"]')).toContainText('Immich');
  });

  test('a category chip shows only that category and puts it in the address', async ({ page }) => {
    await page.goto('/apps/');
    await page.getByRole('link', { name: 'Media', exact: true }).click();
    await expect(page).toHaveURL(/\/apps\/\?category=media$/);
    await expect(page.locator('[data-group="media"]')).toBeVisible();
    await expect(page.locator('[data-group="files"]')).toBeHidden();
    await expect(page.getByRole('link', { name: 'Media', exact: true })).toHaveAttribute('aria-current', 'true');

    // The address alone opens the same view.
    await page.goto('/apps/?category=files');
    await expect(page.locator('[data-group="files"]')).toBeVisible();
    await expect(page.locator('[data-group="media"]')).toBeHidden();
    await page.getByRole('link', { name: 'All apps' }).click();
    await expect(page).toHaveURL(/\/apps\/$/);
    await expect(page.locator('[data-group="media"]')).toBeVisible();
  });

  test('passes axe in both themes', async ({ page }) => {
    await page.goto('/apps/');
    await accessibleInBothThemes(page);
  });
});
