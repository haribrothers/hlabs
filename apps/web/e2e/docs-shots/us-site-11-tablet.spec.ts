// The help's screenshots on a tablet (US-SITE-11, D-175, D-177): the desktop layout by touch, an iPad in landscape.
import { expect, test } from '@playwright/test';
import { DOCS_DEVICES } from '../instances';
import { docsShot } from '../support/docs-shot';
import { freezeClock } from './demo';

test.use({ ...DOCS_DEVICES.tablet });

test.describe('US-SITE-11 docs screenshots · tablet', () => {
  test.beforeEach(async ({ page, request }) => freezeClock(page, request));

  test('Home', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Good morning, Hari' })).toBeVisible();
    await expect(page.getByText('hlabs.tail1234.ts.net')).toBeVisible();
    await expect(page.getByText('612 GB')).toBeVisible();
    await docsShot(page, 'home-tablet');
  });

  test('Files', async ({ page }) => {
    await page.goto('/files?path=/home/Photos');
    await expect(page.getByText('Garden in spring.jpg')).toBeVisible();
    await docsShot(page, 'files-tablet');
  });
});
