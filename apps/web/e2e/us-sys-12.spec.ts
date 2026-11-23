// US-SYS-12 · Manage data location and drives (main instance, admin, the pretend NAS): where data lives; "+ Connect a
// drive" opens the NetworkDrives dialog; a drive going offline and coming back shows without a reload; Disconnect names
// the apps that will stop and leaves the drive offline.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

test.afterEach(async ({ request }) => {
  await request.post(`${MAIN_URL}/dev/fake-nas`, { data: { online: true, forget: true } });
});

test('US-SYS-12 drives connect, go offline and back without a reload, and disconnect', async ({ page, request }) => {
  const reset = await request.post(`${MAIN_URL}/dev/fake-nas`, { data: { online: true, forget: true } });
  expect(reset.ok()).toBe(true);
  await page.goto('/settings/storage');
  const data = page.getByRole('group', { name: 'Data location' });
  await expect(data).toContainText('Home folders, Shared and media live here');
  await expect(data).toContainText('App data · Apps keep their data here');
  await expect(data.getByRole('button', { name: 'Move data…' })).toHaveCount(0);

  const drives = page.getByRole('group', { name: 'Drives' });
  await drives.getByRole('button', { name: '+ Connect a drive' }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect a network drive' });
  await dialog.getByRole('textbox', { name: 'Or enter an address' }).fill('smb://nas.local/Media');
  await dialog.getByRole('textbox', { name: 'Username' }).fill('hari');
  await dialog.getByLabel('Password').fill('nas-password');
  await dialog.getByRole('button', { name: 'Connect' }).click();
  await expect(dialog).toBeHidden();
  const row = drives.locator('.hl-list-row', { hasText: 'nas · Media' });
  await expect(row).toContainText('smb://nas.local/Media · connected');
  await expect(row.getByText('Connected', { exact: true })).toBeVisible();

  // Offline, then back, each within about 10 s, without a reload.
  await request.post(`${MAIN_URL}/dev/fake-nas`, { data: { online: false } });
  await expect(row.getByText('Offline', { exact: true })).toBeVisible({ timeout: 12_000 });
  await expect(row.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
  await request.post(`${MAIN_URL}/dev/fake-nas`, { data: { online: true } });
  await expect(row.getByText('Connected', { exact: true })).toBeVisible({ timeout: 25_000 });

  await row.getByRole('button', { name: 'Disconnect' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Disconnect nas · Media?' });
  await expect(confirm).toContainText('Files on the drive are not deleted.');
  await confirm.getByRole('button', { name: 'Disconnect' }).click();
  await expect(confirm).toBeHidden();
  await expect(row).toContainText('disconnected');
  await expect(row.getByText('Offline', { exact: true })).toBeVisible();
  // It stays disconnected: the drives' check doesn't connect it again by itself.
  await page.waitForTimeout(11_000);
  await expect(row.getByText('Offline', { exact: true })).toBeVisible();
});
