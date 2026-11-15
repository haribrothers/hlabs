// US-FILE-11 · Connect an SMB or NFS drive (main instance, admin, the pretend NAS of HLABS_DEV_FAKE_NAS): the drive
// found on the network, a share chosen, a wrong password said in the dialog, then connected and open in Files.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

test.afterEach(async ({ request }) => {
  await request.post(`${MAIN_URL}/dev/fake-nas`, { data: { online: true, forget: true } });
});

test('US-FILE-11 connect the NAS found on the network and open it', async ({ page, request }) => {
  const reset = await request.post(`${MAIN_URL}/dev/fake-nas`, { data: { online: true, forget: true } });
  expect([reset.status(), await reset.text()]).toEqual([200, '{"online":true}']);
  await page.goto('/files');
  await page.getByRole('button', { name: '+ Connect a drive' }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect a network drive' });
  const nas = dialog.getByRole('button', { name: /nas\.local/ });
  await expect(nas).toContainText('SMB · 3 shares');
  await nas.click();
  await dialog.getByRole('radio', { name: 'Media' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Or enter an address' })).toHaveValue('smb://nas.local/Media');
  await dialog.getByRole('textbox', { name: 'Username' }).fill('hari');
  await dialog.getByLabel('Password').fill('not-it');
  await dialog.getByRole('button', { name: 'Connect' }).click();
  await expect(dialog.getByText('Wrong username or password')).toBeVisible();
  await dialog.getByLabel('Password').fill('nas-password');
  await dialog.getByRole('button', { name: 'Connect' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('navigation', { name: 'Places' }).getByRole('link', { name: 'NAS · Media' }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: 'NAS · Media' })).toBeVisible();
});
