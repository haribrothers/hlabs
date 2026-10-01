// US-STATE-08 · Grey out Home when the engine has stopped (main instance, admin, desktop). The daemon reports its
// engine as stopped through a dev-only route, without touching the real one; runs in the serial project, since every
// app is offline meanwhile.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'offline-demo';

test.afterEach(async ({ request }) => {
  await request.post(`${MAIN_URL}/dev/engine`, { data: { running: true } });
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
});

test('US-STATE-08 Home says the engine stopped, apps are offline, and installing waits; the rest keeps working', async ({
  page,
  request,
}) => {
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name: 'Offline demo' } });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Offline demo' })).toBeVisible();
  await request.post(`${MAIN_URL}/dev/engine`, { data: { running: false } });

  const banner = page.getByRole('status').filter({ hasText: 'The container engine has stopped' });
  await expect(banner).toBeVisible({ timeout: 4_000 });
  await expect(banner).toContainText('All apps are offline. Your data is safe.');
  const tile = page.getByRole('button', { name: 'Offline demo', exact: true });
  await expect(tile).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('link', { name: 'Install app' })).toHaveAttribute('aria-disabled', 'true');

  // Search and the Dock keep working.
  await page.getByTestId('dock-bar').getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Installing waits for the engine.
  await page.goto('/store/app/uptime-kuma');
  const install = page.getByRole('button', { name: 'Install', exact: true });
  await expect(install).toBeDisabled();
  await expect(install).toHaveAttribute('title', 'Start the container engine first');

  await page.goto('/');
  await banner.getByRole('link', { name: 'Details' }).click();
  await expect(page).toHaveURL(/\/settings\/engine$/);
});
