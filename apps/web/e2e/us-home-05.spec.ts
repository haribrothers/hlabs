// US-HOME-05 · See badge counts in the Dock (main instance). The update badge counts the App Store's updates list
// (phase 7, previewed here, D-156); before phase 7 no badge shows and the dashboard never asks for updates (unit tests).
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

test('US-HOME-05 the App Store badge counts the apps with updates (admins, phase 7)', async ({
  page,
  request,
}, info) => {
  // A stand-in for a store app at an old version: it has an update (one per project, as they run at the same time).
  const id = info.project.name === 'phone' ? 'home-assistant' : 'syncthing';
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id, behind: '0.0.1' } });
  try {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Dock' }).or(page.getByRole('navigation', { name: 'Tab bar' }));
    await expect(nav).toBeVisible();
    await expect(nav.locator('.hl-dock-badge, .hl-count').first()).toHaveText(/^([1-9]|9\+)$/);
  } finally {
    await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id, remove: true } });
  }
});
