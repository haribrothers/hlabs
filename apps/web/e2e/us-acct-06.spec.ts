// US-ACCT-06 · Change my password (first-run instance, after onboarding).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

const NEW = 'a much longer passphrase';

test('US-ACCT-06 change my password: other devices are signed out, this one stays', async ({
  page,
  request,
  browser,
}) => {
  await finishOnboarding(page, request);
  const other = await (await browser.newContext({ baseURL: FIRST_RUN_URL })).newPage();
  await other.goto('/login/username');
  await other.getByLabel('Username').fill(ADMIN.username);
  await other.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await other.getByRole('button', { name: 'Log in' }).click();
  await expect(other).toHaveURL(`${FIRST_RUN_URL}/`);

  await page.goto('/settings/account');
  await expect(page.getByText('Changed when you set up hlabs')).toBeVisible();
  await page.getByRole('button', { name: 'Change password' }).click();
  const dialog = page.getByRole('dialog', { name: 'Change password' });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await dialog.getByLabel('Current password').fill(ADMIN.password);
  await dialog.getByLabel('New password', { exact: true }).fill(NEW);
  await expect(dialog.getByText('Strong · at least 12 characters')).toBeVisible();
  await dialog.getByLabel('Confirm new password').fill(NEW);
  await dialog.getByLabel('Confirm new password').press('Enter');

  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('status').filter({ hasText: 'Password changed. Your other devices are signed out.' }),
  ).toBeVisible();
  await expect(page.getByText(/^Changed .* ago$|^Changed just now$/)).toBeVisible();
  await expect(other).toHaveURL(/\/login/, { timeout: 5000 });

  // The new password works.
  await other.goto('/login/username');
  await other.getByLabel('Username').fill(ADMIN.username);
  await other.getByLabel('Password', { exact: true }).fill(NEW);
  await other.getByRole('button', { name: 'Log in' }).click();
  await expect(other).toHaveURL(`${FIRST_RUN_URL}/`);
});
