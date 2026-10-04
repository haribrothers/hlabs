// US-SYS-25 · Update apps from Settings (main instance, signed in as an admin). The desktop specs run before any spec
// installs an app, so the real list is empty; then the page is told about two updates to check the rows and notes.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-SYS-25 app updates: none, then two with their notes', async ({ page }) => {
  await page.goto('/settings/updates');
  // The first visit can wait on the dev server compiling the page.
  await expect(page.getByText('All apps are up to date')).toBeVisible({ timeout: 30_000 });

  const icon = { logoUrl: null, gradient: null, fallback: null };
  await page.route(/\/trpc\/[^?]*store\.listUpdates/, async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as Array<{ result: { data: Record<string, unknown> } }>;
    const paths = new URL(route.request().url()).pathname.replace('/trpc/', '').split(',');
    paths.forEach((p, i) => {
      if (p !== 'store.listUpdates') return;
      body[i]!.result.data.pending = [
        {
          appId: 'home-assistant',
          name: 'Home Assistant',
          icon,
          state: 'running',
          fromVersion: '2026.9',
          toVersion: '2026.10',
          releaseNotes: '- Faster dashboards',
        },
        {
          appId: 'immich',
          name: 'Immich',
          icon,
          state: 'running',
          fromVersion: '1.2',
          toVersion: '1.3',
          releaseNotes: null,
        },
      ];
    });
    await route.fulfill({ response: res, json: body });
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'App updates · 2' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('2026.9 → 2026.10')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: "What's new" }).first().click();
  const dialog = page.getByRole('dialog', { name: "What's new in Home Assistant 2026.10" });
  await expect(dialog.getByText('Faster dashboards')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
