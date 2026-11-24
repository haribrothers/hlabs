// The help's screenshots on a phone (US-SITE-11, D-177): the phone layout (D-172, D-174) at 390 × 844.
import { expect, test } from '@playwright/test';
import { DOCS_DEVICES } from '../instances';
import { docsShot } from '../support/docs-shot';
import { freezeClock } from './demo';

test.use({ ...DOCS_DEVICES.phone });

test.describe('US-SITE-11 docs screenshots · phone', () => {
  test.beforeEach(async ({ page, request }) => freezeClock(page, request));

  test('Home', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Tab bar' })).toBeVisible();
    await expect(page.getByText(/Good morning, Hari\./)).toBeVisible();
    await expect(page.getByText('612 GB')).toBeVisible();
    await docsShot(page, 'home-phone');
  });

  test('App Store', async ({ page }) => {
    await page.goto('/store');
    await expect(page.getByText('Popular with families')).toBeVisible();
    await docsShot(page, 'app-store-phone');
  });

  test('Files', async ({ page }) => {
    await page.goto('/files');
    await expect(page.getByText('Documents')).toBeVisible();
    await docsShot(page, 'files-phone');
  });

  test('Settings', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('612 GB free')).toBeVisible();
    await docsShot(page, 'settings-phone');
  });
});
