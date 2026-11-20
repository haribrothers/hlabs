// US-FILE-12 · Disconnect or recover a network drive (main instance, admin, the pretend NAS): offline it says "Can't
// reach", Try again brings it back once the NAS is on, and Disconnect forgets it.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

test.afterEach(async ({ request }) => {
  await request.post(`${MAIN_URL}/dev/fake-nas`, { data: { online: true, forget: true } });
});

test('US-FILE-12 a drive that goes offline says so, comes back with Try again, and disconnects', async ({
  page,
  request,
}) => {
  const reset = await request.post(`${MAIN_URL}/dev/fake-nas`, { data: { online: true, forget: true } });
  expect([reset.status(), await reset.text()]).toEqual([200, '{"online":true}']);
  await page.goto('/files');
  await page.getByRole('button', { name: 'Connect a drive' }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect a network drive' });
  await dialog.getByRole('textbox', { name: 'Or enter an address' }).fill('smb://nas.local/Photos');
  await dialog.getByRole('textbox', { name: 'Username' }).fill('hari');
  await dialog.getByLabel('Password').fill('nas-password');
  await dialog.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'nas · Photos' })).toBeVisible();

  await request.post(`${MAIN_URL}/dev/fake-nas`, { data: { online: false } });
  await page.reload();
  await expect(page.getByText("Can't reach nas · Photos")).toBeVisible();
  const places = page.getByRole('navigation', { name: 'Places' });
  await expect(places.getByRole('link', { name: /nas · Photos/ })).toContainText('Offline');
  // Still away: Try again (busy while it tries) says the same.
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled();
  await expect(page.getByText("Can't reach nas · Photos")).toBeVisible();
  await request.post(`${MAIN_URL}/dev/fake-nas`, { data: { online: true } });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('This folder is empty')).toBeVisible();

  await places.getByRole('link', { name: /nas · Photos/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Disconnect' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Disconnect nas · Photos?' });
  await expect(confirm).toContainText('Files on the drive are not deleted.');
  await confirm.getByRole('button', { name: 'Disconnect' }).click();
  await expect(places.getByRole('link', { name: /nas · Photos/ })).toBeHidden();
  await expect(page).toHaveURL(/path=%2Fhome$/);
});
