// US-SITE-02 · Download the right build for my computer (with the release fixture: 0.6.0 stable, 0.7.0-beta.1).
import { expect, test, type Page } from '@playwright/test';
import { BETA_ONLY_URL, FIXTURE, accessibleInBothThemes } from './helpers';

const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36';
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36';

/** The download page's cards, in the order they're on the page. */
const cardOrder = (page: Page) =>
  page
    .locator('section[aria-label="Stable downloads"] [data-os]')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.os));

test.describe('US-SITE-02', () => {
  test('on a Mac, the Apple silicon disk image comes first, with Intel as a second link', async ({ browser }) => {
    const context = await browser.newContext({ userAgent: MAC });
    const page = await context.newPage();
    await page.goto('/download/');
    expect(await cardOrder(page)).toEqual(['mac', 'linux']);
    const stable = page.getByRole('region', { name: 'Stable downloads' });
    await expect(stable.getByRole('link', { name: 'Download for Mac (Apple silicon)' })).toHaveAttribute(
      'href',
      `${FIXTURE.releases}/v0.6.0/hlabs-0.6.0-mac-arm64.dmg`,
    );
    await expect(stable.getByRole('link', { name: 'Download for Intel Mac' })).toHaveAttribute(
      'href',
      `${FIXTURE.releases}/v0.6.0/hlabs-0.6.0-mac-x64.dmg`,
    );
    await context.close();
  });

  test('on Linux, the server command comes first with Copy, then .deb, .rpm and AppImage', async ({ browser }) => {
    const context = await browser.newContext({ userAgent: LINUX });
    const page = await context.newPage();
    await page.goto('/download/');
    expect(await cardOrder(page)).toEqual(['linux', 'mac']);
    const stable = page.getByRole('region', { name: 'Stable downloads' });
    await expect(stable.locator('code').first()).toHaveText('$ curl -fsSL https://hlabs.h4loom.com/install.sh | sh');
    await expect(stable.getByRole('button', { name: 'Copy the install command' })).toBeVisible();
    for (const label of ['.deb', '.rpm', 'AppImage']) {
      await expect(stable.getByRole('link', { name: `Download the ${label} for x86_64` })).toHaveAttribute(
        'href',
        new RegExp(`hlabs-0\\.6\\.0-linux-x86_64\\.${label.replace('.', '')}$`, 'i'),
      );
    }
    // arm64's are one switch away.
    await stable.getByRole('button', { name: 'arm64' }).click();
    await expect(stable.getByRole('link', { name: 'Download the .deb for arm64' })).toBeVisible();
    await context.close();
  });

  test('every option shows its version, date, size and SHA-256, and links to all downloads', async ({ page }) => {
    await page.goto('/download/');
    const stable = page.getByRole('region', { name: 'Stable downloads' });
    await expect(page.getByText('Version 0.6.0 · 18 November 2026')).toBeVisible();
    const meta = stable.locator('.meta');
    await expect(meta).toContainText('0.6.0');
    await expect(meta).toContainText('18 November 2026');
    await expect(meta).toContainText('142 MB');
    await expect(stable.locator('.sha-value')).toHaveText(/^[0-9a-f]{64}$/);
    await expect(stable.locator('.pkg-sha-value').first()).toHaveText(/^[0-9a-f]{64}$/);
    await expect(stable.getByRole('link', { name: 'All downloads and older versions' })).toHaveAttribute(
      'href',
      'https://github.com/haribrothers/hlabs/releases',
    );
  });

  test('the Beta switch shows the beta release and says what beta means', async ({ page }) => {
    await page.goto('/download/');
    await page.getByRole('button', { name: 'Beta' }).click();
    await expect(page.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(`Version ${FIXTURE.beta}`)).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Beta builds may have bugs.');
    const beta = page.getByRole('region', { name: 'Beta downloads' });
    await expect(beta.getByRole('link', { name: 'Download for Mac (Apple silicon)' })).toHaveAttribute(
      'href',
      `${FIXTURE.releases}/v0.7.0-beta.1/hlabs-0.7.0-beta.1-mac-arm64.dmg`,
    );
    await expect(beta.locator('code').first()).toContainText('sh -s -- --channel beta');
    await expect(page.getByRole('region', { name: 'Stable downloads' })).toBeHidden();
  });

  test('passes axe in both themes', async ({ page }) => {
    await page.goto('/download/');
    await accessibleInBothThemes(page);
  });

  test('before the first stable release, it offers the beta and says so', async ({ page }) => {
    await page.goto(`${BETA_ONLY_URL}/download/`);
    await expect(page.getByText(`Version ${FIXTURE.beta}`)).toBeVisible();
    await expect(page.getByRole('status')).toContainText("There's no stable release yet: this is the beta.");
    // Nothing to switch between.
    await expect(page.getByRole('button', { name: 'Stable' })).toHaveCount(0);
    const beta = page.getByRole('region', { name: 'Beta downloads' });
    await expect(beta.getByRole('link', { name: 'Download for Mac (Apple silicon)' })).toHaveAttribute(
      'href',
      `${FIXTURE.releases}/v0.7.0-beta.1/hlabs-0.7.0-beta.1-mac-arm64.dmg`,
    );
    await expect(beta.locator('code').first()).toHaveText(
      '$ curl -fsSL https://hlabs.h4loom.com/install.sh | sh -s -- --channel beta',
    );
    await accessibleInBothThemes(page);
  });

  test("the home page's install command asks for the beta while only a beta exists", async ({ page }) => {
    await page.goto(`${BETA_ONLY_URL}/`);
    await expect(page.locator('.terminal pre')).toContainText('install.sh | sh -s -- --channel beta');
  });
});
