// US-SITE-04 · Read an app's page, from its manifest in store/.
import { expect, test } from '@playwright/test';
import { accessibleInBothThemes } from './helpers';

test.describe('US-SITE-04', () => {
  test("shows the app's logo, name, developer, description, screenshots, group, links and licence", async ({
    page,
  }) => {
    await page.goto('/apps/immich/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Immich');
    await expect(page.locator('img[src="/apps/immich/logo.svg"]')).toBeVisible();
    const about = page.getByRole('list', { name: 'About this app' });
    await expect(about).toContainText('Files & photos');
    await expect(about).toContainText('By Immich');
    await expect(about).toContainText('AGPL-3.0');
    await expect(page.getByText(/Self-hosted photo and video backup with albums/)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Screenshots' }).getByRole('img')).toHaveCount(3);
    await expect(page.getByRole('link', { name: /^Website/ })).toHaveAttribute('href', 'https://immich.app');
    await expect(page.getByRole('link', { name: /^Source code/ })).toHaveAttribute(
      'href',
      'https://github.com/immich-app/immich',
    );
    // The files themselves are served from the store.
    const shot = await page.request.get('/apps/immich/screenshot-1.webp');
    expect(shot.ok()).toBe(true);
  });

  test('"What it needs" shows memory, folders and what it reaches', async ({ page }) => {
    await page.goto('/apps/immich/');
    const needs = page.getByRole('region', { name: 'What it needs' });
    await expect(needs).toContainText('About 4 GB of memory');
    await expect(needs).toContainText('A folder: Photo library');
    await expect(needs).toContainText('Home › Photos unless you pick another folder.');
    await expect(needs).toContainText('Reaches the internet');
  });

  test('Install explains it happens in the dashboard, with the install guide', async ({ page }) => {
    await page.goto('/apps/immich/');
    await page.getByRole('link', { name: 'How to install', exact: true }).click();
    const box = page.getByRole('region', { name: 'Install Immich' });
    await expect(box).toBeInViewport();
    await expect(box).toContainText('Open the App Store in your hlabs dashboard and search for Immich.');
    await expect(box.getByRole('link', { name: 'How to install apps' })).toHaveAttribute(
      'href',
      '/help/apps/app-store/',
    );
    await expect(box).toContainText('This site never talks to your hlabs.');
  });

  test('without screenshots, there is no screenshots row', async ({ page }) => {
    // The tests' store copy has none for Gitea (e2e/build.ts).
    await page.goto('/apps/gitea/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gitea');
    await expect(page.getByRole('region', { name: 'Screenshots' })).toHaveCount(0);
  });

  test('passes axe in both themes', async ({ page }) => {
    await page.goto('/apps/immich/');
    await accessibleInBothThemes(page);
  });
});
