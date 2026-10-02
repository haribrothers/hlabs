// US-ACCT-15 · Change role, disable or enable someone (first-run instance: an admin and a signed-in member).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createMember, signedInAs } from './invites';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ACCT-15 disabling signs the member out and stops their log-in; enabling lets the old password work', async ({
  page,
  request,
  browser,
}, info) => {
  await finishOnboarding(page, request);
  const member = await createMember(page, request, FIRST_RUN_URL, { name: 'Anu' });
  const anu = await signedInAs(browser, info.project.use, FIRST_RUN_URL, member);

  await page.goto('/settings/users');
  const row = page.locator('.hl-list-row', { hasText: 'Anu' });
  const menu = async (item: string) => {
    await row.getByRole('button', { name: 'More options for Anu' }).click();
    await page.getByRole('menuitem', { name: item }).click();
  };
  await menu('Disable');
  await page.getByRole('alertdialog', { name: 'Disable Anu?' }).getByRole('button', { name: 'Disable' }).click();
  await expect(page.getByText('Anu is disabled')).toBeVisible();
  await expect(row.getByText('Disabled')).toBeVisible();

  // Their open dashboard goes to log in, and logging in fails like a wrong password.
  await expect(anu).toHaveURL(/\/login/);
  await anu.goto('/login/username');
  await anu.getByLabel('Username').fill(member.username);
  await anu.getByLabel('Password', { exact: true }).fill(member.password);
  await anu.getByRole('button', { name: 'Log in' }).click();
  await expect(anu.getByText('Username or password is incorrect.')).toBeVisible();
  await expect(anu).toHaveURL(/\/login\/username/);

  await menu('Enable');
  await expect(page.getByText('Anu can log in again')).toBeVisible();
  await anu.getByLabel('Password', { exact: true }).fill(member.password);
  await anu.getByRole('button', { name: 'Log in' }).click();
  await expect(anu).toHaveURL(`${FIRST_RUN_URL}/`);

  // Make admin, after confirming.
  await menu('Make admin');
  const dialog = page.getByRole('alertdialog', { name: 'Make Anu an admin?' });
  await expect(dialog).toContainText('Anu will be able to change everything.');
  await dialog.getByRole('button', { name: 'Make admin' }).click();
  await expect(row.getByText('Admin', { exact: true })).toBeVisible();
});
