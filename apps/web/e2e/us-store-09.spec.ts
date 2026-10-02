// US-STORE-09 · Review included services, address and login (main instance, admin). Nothing is installed.
import { expect, test } from '@playwright/test';

test('US-STORE-09 the sheet lists what runs, checks the address and Cancel creates nothing', async ({ page }) => {
  await page.goto('/store/app/immich?install=true');
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Immich server')).toBeVisible();
  await expect(sheet.getByText('database · private to this app')).toBeVisible();
  await expect(sheet.getByText('Login required')).toBeVisible();

  const address = sheet.getByRole('textbox', { name: 'App address' });
  await expect(address).toHaveValue('immich');
  await address.fill('Not ok!');
  await expect(sheet.getByText('Use lowercase letters, numbers and dashes')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Install', exact: true })).toBeDisabled();
  await address.fill('hlabs');
  await expect(sheet.getByText('Another app already uses this address')).toBeVisible();
  await address.fill('family-photos');
  await expect(sheet.getByRole('button', { name: 'Install', exact: true })).toBeEnabled();

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/store\/app\/immich$/);
  // Still "Install": nothing was created.
  await expect(page.getByRole('button', { name: 'Install', exact: true })).toBeVisible();
});
