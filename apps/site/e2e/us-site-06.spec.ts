// US-SITE-06 · Follow a step-by-step install guide.
import { expect, test } from '@playwright/test';

const GUIDES = [
  { path: '/help/install/mac/', title: 'Install on a Mac' },
  { path: '/help/install/linux-server/', title: 'Install on a Linux server' },
  { path: '/help/install/linux-desktop/', title: 'Install on a Linux desktop' },
  { path: '/help/install/uninstall/', title: 'Uninstall hlabs' },
];

test.describe('US-SITE-06', () => {
  test('the Install section has a guide for the Mac, a Linux server, a Linux desktop and uninstalling', async ({
    page,
  }) => {
    await page.goto('/help/');
    const install = page.getByRole('navigation', { name: 'Main' }).locator('details', { hasText: 'Install' }).first();
    const links = await install.getByRole('link').allTextContents();
    expect(links.map((l) => l.trim())).toEqual(GUIDES.map((g) => g.title));
  });

  for (const guide of GUIDES) {
    test(`"${guide.title}" is numbered steps, with pictures of what's on screen`, async ({ page }) => {
      await page.goto(guide.path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(guide.title);
      const steps = page.locator('ol.sl-steps');
      await expect(steps.first()).toBeVisible();
      expect(await steps.first().locator(':scope > li').count()).toBeGreaterThanOrEqual(3);
      // Every picture loads and says what it shows.
      const pictures = steps.locator('img');
      expect(await pictures.count()).toBeGreaterThanOrEqual(1);
      for (const img of await pictures.all()) {
        await img.scrollIntoViewIfNeeded();
        expect(await img.getAttribute('alt')).toBeTruthy();
        expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
      }
    });
  }

  test('the Mac guide covers the disk image, first launch, the menu bar, the engine and setup', async ({ page }) => {
    await page.goto('/help/install/mac/');
    const steps = page.locator('ol.sl-steps').first();
    await expect(steps).toContainText('drag hlabs onto Applications');
    await expect(steps).toContainText('Setting up hlabs');
    await expect(steps).toContainText('menu bar');
    for (const engine of ['Colima', 'OrbStack', 'Docker Desktop']) {
      await expect(steps.getByRole('tab', { name: engine })).toBeVisible();
    }
    await expect(steps).toContainText('hlabs installs its own Colima for you');
    await expect(steps.getByRole('link', { name: 'Set up hlabs' })).toHaveAttribute('href', /get-started\/set-up\/$/);
  });

  for (const guide of GUIDES.slice(0, 3)) {
    test(`"${guide.title}" ends with "Install your first app"`, async ({ page }) => {
      await page.goto(guide.path);
      const headings = await page.locator('.sl-markdown-content h2').allTextContents();
      expect(headings.at(-1)?.trim()).toBe('Install your first app');
      const last = page.locator('.sl-markdown-content > p').last();
      await expect(last.getByRole('link', { name: 'The App Store' })).toHaveAttribute('href', /apps\/app-store\/$/);
    });
  }

  test('a step that differs by engine or distribution has tabs, and the choice is remembered', async ({ page }) => {
    await page.goto('/help/install/mac/');
    await page.getByRole('tab', { name: 'OrbStack' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('hlabs uses OrbStack');
    await page.reload();
    await expect(page.getByRole('tab', { name: 'OrbStack' })).toHaveAttribute('aria-selected', 'true');

    await page.goto('/help/install/linux-desktop/');
    await page.getByRole('tab', { name: 'Fedora' }).click();
    await page.goto('/help/install/linux-desktop/');
    await expect(page.getByRole('tab', { name: 'Fedora' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toContainText('sudo dnf install');
  });
});
