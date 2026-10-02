// US-ACCT-28 · Member's account page (first-run instance: a member on their own browser).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createMember, signedInAs } from './invites';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ACCT-28 a member sees their account and changes their own password', async ({
  page,
  request,
  browser,
}, info) => {
  await finishOnboarding(page, request);
  const member = await createMember(page, request, FIRST_RUN_URL, { name: 'Anu' });
  const anu = await signedInAs(browser, info.project.use, FIRST_RUN_URL, member);

  await anu.goto('/settings/account');
  await expect(anu.getByText(`${member.username} · Member`, { exact: true })).toBeVisible();
  await expect(anu.getByText('Set when you joined hlabs')).toBeVisible();
  await expect(anu.getByRole('group', { name: 'Signed-in devices' }).getByText('This device')).toBeVisible();

  await anu.getByRole('button', { name: 'Change password' }).click();
  const dialog = anu.getByRole('dialog', { name: 'Change password' });
  await dialog.getByLabel('Current password').fill(member.password);
  await dialog.getByLabel('New password', { exact: true }).fill('a brand new long passphrase');
  await dialog.getByLabel('Confirm new password').fill('a brand new long passphrase');
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(anu.getByText('Password changed. Your other devices are signed out.')).toBeVisible();
  await expect(anu.getByText(/^Changed /)).toBeVisible();
});
