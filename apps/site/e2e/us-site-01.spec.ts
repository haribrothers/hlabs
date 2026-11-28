// US-SITE-01 · Understand hlabs from the home page.
import { expect, test } from '@playwright/test';
import { accessibleInBothThemes, storeAppIds } from './helpers';

test.describe('US-SITE-01', () => {
  test('says what hlabs is, with Download and Read the docs', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'hlabs home' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your own cloud, at home');
    await expect(page.getByText(/^hlabs turns a Mac or a Linux computer into a private cloud/)).toBeVisible();
    const main = page.getByRole('main');
    await expect(main.getByRole('link', { name: 'Download', exact: true })).toHaveAttribute('href', '/download/');
    await expect(main.getByRole('link', { name: 'Read the docs' })).toHaveAttribute('href', '/help/');
  });

  test('shows Home with the Dock, every store app, and a section for each part linking to its help', async ({
    page,
  }) => {
    await page.goto('/');
    // The product's own Home, from the docs screenshots (US-SITE-11).
    await expect(page.getByRole('img', { name: /^hlabs Home: Good morning, Hari/ })).toBeVisible();

    // Three rows of apps, every app once (D-192); each row's looping copy is hidden from screen readers and Tab.
    const rows = page.locator('[data-app-rows] .marquee');
    await expect(rows).toHaveCount(3);
    const hrefs = await page
      .locator('.marquee-list:not(.marquee-dup) a')
      .evaluateAll((links) => links.map((l) => l.getAttribute('href')));
    expect(hrefs.sort()).toEqual(storeAppIds().map((id) => `/apps/${id}/`));
    const copies = page.locator('.marquee-dup');
    await expect(copies).toHaveCount(3);
    for (const copy of await copies.all()) await expect(copy).toHaveAttribute('aria-hidden', 'true');
    // Each row mixes the store's groups, with no two neighbours from the same group.
    for (const row of await rows.all()) {
      const groups = await row
        .locator('.marquee-list:not(.marquee-dup) .mq-cat')
        .evaluateAll((cats) => cats.map((c) => c.textContent));
      expect(new Set(groups).size).toBeGreaterThan(3);
      groups.slice(1).forEach((g, i) => expect(g, `${groups[i]} then ${g}`).not.toBe(groups[i]));
    }

    for (const [title, href] of [
      ['Apps in one click', '/help/apps/app-store/'],
      ['Your files', '/help/files/files/'],
      ['Backups that run themselves', '/help/backups/backups/'],
      ['Reach it from anywhere', '/help/remote-access/tailscale/'],
      ['Room for the family', '/help/people/people/'],
    ]) {
      const card = page.locator('article', { has: page.getByRole('heading', { name: title }) });
      await expect(card.getByRole('link', { name: /^Learn about/ })).toHaveAttribute('href', href);
    }
  });

  test('lists what you need', async ({ page }) => {
    await page.goto('/');
    const need = page.locator('section', { has: page.getByRole('heading', { name: 'A computer you already have' }) });
    await expect(need).toContainText('Apple silicon');
    await expect(need).toContainText('macOS 14 Sonoma or later');
    await expect(need).toContainText('Ubuntu 22.04+, Debian 12+ or Fedora 40+, with systemd');
    await expect(need).toContainText('x86_64 or arm64');
    await expect(need).toContainText('8 GB recommended');
    await expect(need).toContainText('No container engine yet? hlabs sets one up for you.');
  });

  test('the footer links to GitHub, both licences, Privacy and Release notes', async ({ page }) => {
    await page.goto('/');
    const footer = page.getByRole('contentinfo');
    await expect(footer.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      /github\.com\/haribrothers\/hlabs$/,
    );
    await expect(footer.getByRole('link', { name: 'Licence: AGPL-3.0' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Docs licence: CC BY 4.0' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy/');
    await expect(footer.getByRole('link', { name: 'Release notes' })).toHaveAttribute('href', '/releases/');
  });

  test('passes axe in both themes', async ({ page }) => {
    await page.goto('/');
    await accessibleInBothThemes(page);
  });

  test('works without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your own cloud, at home');
    // Every step of "How it works" is on the page, one after another.
    for (const step of ['Download hlabs', 'Make your account in the browser', 'Install apps in one click']) {
      await expect(page.getByRole('heading', { name: step })).toBeVisible();
    }
    await context.close();
  });
});
