// US-APP-11 · Confirm uninstall and choose what happens to data (main instance, admin, desktop). The dialog's choices
// and Cancel; running the uninstall is US-APP-12.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'uninstall-confirm-demo';

// A skipped run (the phone project) must leave the stand-in alone: the desktop run may be using it.
test.afterEach(async ({ request }, info) => {
  if (info.status === 'skipped') return;
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
});

test('US-APP-11 "Uninstall…" asks what happens to the data, keeping it by default; Cancel changes nothing', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name === 'phone', 'App settings on a phone is 12-phone.md');
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name: 'Confirm demo' } });
  await page.goto(`/apps/${ID}/settings`);
  await page.getByRole('button', { name: 'Uninstall…' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Uninstall Confirm demo?' });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expect(dialog.getByRole('radio', { name: /Keep its data/ })).toHaveAttribute('aria-checked', 'true');
  await dialog.getByRole('radio', { name: /Delete its data too/ }).click();
  await expect(dialog.getByRole('button', { name: 'Uninstall and delete data' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Confirm demo' })).toBeVisible();
});
