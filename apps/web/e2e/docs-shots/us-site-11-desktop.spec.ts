// The help's screenshots on a computer (US-SITE-11, D-177): each screen as the help describes it, from the demo data
// set. Runs only in the docs-shots project; see developers/docs-screenshots.
import { expect, test } from '@playwright/test';
import { DOCS_DEVICES } from '../instances';
import { docsShot } from '../support/docs-shot';
import { freezeClock } from './demo';

test.use({ ...DOCS_DEVICES.desktop });

test.describe('US-SITE-11 docs screenshots · desktop', () => {
  test.beforeEach(async ({ page, request }) => freezeClock(page, request));

  test('Home', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Good morning, Hari' })).toBeVisible();
    await expect(page.getByText('hlabs.tail1234.ts.net')).toBeVisible();
    await expect(page.getByText('6 hours ago')).toBeVisible();
    await expect(page.getByText('612 GB')).toBeVisible();
    await expect(page.getByText(/\d+\.\d \/ 32 GB/)).toBeVisible();
    await docsShot(page, 'home');
  });

  test('Live usage', async ({ page }) => {
    await page.goto('/usage');
    await expect(page.getByText('CPU over the last hour')).toBeVisible();
    await expect(page.getByRole('row', { name: /Immich/ })).toBeVisible();
    await expect(page.getByText(/Peak \d+%/)).toBeVisible();
    await docsShot(page, 'live-usage');
  });

  test('App Store', async ({ page }) => {
    await page.goto('/store');
    await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
    await expect(page.getByText('Popular with families')).toBeVisible();
    await docsShot(page, 'app-store');
  });

  test("An app's page in the App Store", async ({ page }) => {
    await page.goto('/store/app/audiobookshelf');
    await expect(page.getByRole('heading', { name: 'Audiobookshelf', level: 1 })).toBeVisible();
    await expect(page.getByText('What it can access')).toBeVisible();
    await docsShot(page, 'app-details');
  });

  test('App settings', async ({ page }) => {
    await page.goto('/apps/jellyfin/settings');
    await expect(page.getByRole('dialog').getByText('Jellyfin', { exact: true })).toBeVisible();
    await expect(page.getByText('~/hlabs/app-data/jellyfin')).toBeVisible();
    await docsShot(page, 'app-settings');
  });

  test('Files', async ({ page }) => {
    await page.goto('/files?path=/home/Photos');
    await expect(page.getByText('Garden in spring.jpg')).toBeVisible();
    await expect(page.getByText('Iceland 2025')).toBeVisible();
    await docsShot(page, 'files');
  });

  test('Backups', async ({ page }) => {
    await page.goto('/backups');
    await expect(page.getByText('Last backup 6 hours ago')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Recent runs' }).getByText('Today, 03:00')).toBeVisible();
    await docsShot(page, 'backups');
  });

  test('Settings', async ({ page }) => {
    await page.goto('/settings/account');
    await expect(page.getByText('Two-factor login')).toBeVisible();
    await expect(page.getByText('Mac · Chrome')).toBeVisible();
    await docsShot(page, 'settings');
  });

  test('People', async ({ page }) => {
    await page.goto('/settings/users');
    await expect(page.getByText('Maya', { exact: true })).toBeVisible();
    await expect(page.getByText('Leo', { exact: true })).toBeVisible();
    await docsShot(page, 'people');
  });
});
