// US-SITE-07 · Find help for every part of hlabs.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test.describe('US-SITE-07', () => {
  test('the help sidebar is organised like the product, in this order', async ({ page }) => {
    await page.goto('/help/');
    const sidebar = page.getByRole('navigation', { name: 'Main' });
    const groups = await sidebar.locator('details > summary').allTextContents();
    expect(groups.map((g) => g.trim())).toEqual([
      'Get started',
      'Install',
      'Home and the Dock',
      'Apps and the App Store',
      'Files',
      'Backups and restore',
      'Remote access',
      'People and family',
      'Settings',
      'Menu-bar app',
      'Troubleshooting',
      'Reference',
    ]);
    // The FAQ comes last, on its own.
    await expect(sidebar.getByRole('link', { name: 'Questions people ask' })).toHaveAttribute('href', '/help/faq/');
    const reference = await sidebar.locator('details', { hasText: 'Reference' }).getByRole('link').allTextContents();
    expect(reference.map((r) => r.trim())).toEqual(['The hlabs command', 'App manifest']);
  });

  test('every shipped feature has a page, and every page says first who it is for (site:check)', () => {
    // The same check CI runs on the published build, on the build these tests use.
    const r = spawnSync('node', [resolve(import.meta.dirname, '../../../scripts/site-check.ts')], {
      encoding: 'utf8',
      env: { ...process.env, HLABS_SITE_OUT_DIR: './dist-e2e' },
    });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^✓ \d+ features have help, .* pages say who they're for/);
  });

  test('a page shows when it was last updated, an edit link, and the pages before and after it', async ({ page }) => {
    await page.goto('/help/files/files/');
    await expect(page.getByText(/^Last updated:/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Edit page/ })).toHaveAttribute(
      'href',
      'https://github.com/haribrothers/hlabs/edit/main/apps/site/src/content/docs/help/files/files.md',
    );
    await expect(page.locator('a[rel="prev"]')).toContainText('Manage an app');
    await expect(page.locator('a[rel="next"]')).toContainText('Back up and restore');
  });

  test("a family member's task says at the top that it's for everyone; an admin's that it's for admins", async ({
    page,
  }) => {
    const first = () => page.locator('.sl-markdown-content > p').first();
    await page.goto('/help/files/files/');
    await expect(first()).toHaveText(/^For everyone/);
    await page.goto('/help/backups/backups/');
    await expect(first()).toHaveText(/^For admins/);
  });
});
