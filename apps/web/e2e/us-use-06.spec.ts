// US-USE-06 · Sort the per-app table (main instance, signed in as an admin). The desktop and phone specs run before any
// spec installs an app, so apps.list is answered with two apps here (the rest of the page is the real daemon).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-USE-06 the table sorts by memory first, by a header from the keyboard, and remembers it', async ({ page }) => {
  await page.route(/\/trpc\/[^?]*apps\.list/, async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as unknown[];
    const paths = new URL(route.request().url()).pathname.replace('/trpc/', '').split(',');
    const apps = ['Immich', 'Jellyfin'].map((name) => ({
      id: name.toLowerCase(),
      name,
      state: 'running',
      icon: { logoUrl: null, gradient: null, fallback: null },
      embed: false,
      ownLogin: false,
      urls: { local: `https://${name.toLowerCase()}.hlabs.local`, tailnet: null, port: null },
    }));
    paths.forEach((p, i) => {
      if (p === 'apps.list') body[i] = { result: { data: { apps } } };
    });
    await route.fulfill({ response: res, json: body });
  });
  await page.goto('/usage');
  // The first visit can wait on the dev server compiling the page.
  const table = page.getByRole('table', { name: 'Apps' });
  await expect(table).toBeVisible({ timeout: 30_000 });
  const memory = table.getByRole('columnheader', { name: /^Memory/ });
  await expect(memory).toHaveAttribute('aria-sort', 'descending');
  await expect(memory).toHaveText('Memory↓');

  // Status shows on a phone too (CPU and Network are hidden there unless sorted); it sorts A–Z first.
  await table.getByRole('button', { name: 'Status' }).focus();
  await page.keyboard.press('Enter');
  const status = table.getByRole('columnheader', { name: /^Status/ });
  await expect(status).toHaveAttribute('aria-sort', 'ascending');
  await page.keyboard.press('Space');
  await expect(status).toHaveAttribute('aria-sort', 'descending');
  await expect(memory).not.toHaveAttribute('aria-sort');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.reload();
  await expect(table.getByRole('columnheader', { name: /^Status/ })).toHaveAttribute('aria-sort', 'descending', {
    timeout: 30_000,
  });
  // Back to the default for the other specs on this instance.
  await page.evaluate(() => localStorage.removeItem('hlabs.usage.sort'));
});
