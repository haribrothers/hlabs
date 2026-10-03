// US-AUTH-22 · Set a new password from an admin's reset link (first-run instance): the member opens the link, sets a
// new password, is signed in and lands Home; the link then says it has expired.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createMember } from './invites';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-AUTH-22 the member chooses a new password from the link and lands Home', async ({
  page,
  request,
  browser,
}) => {
  await finishOnboarding(page, request);
  await createMember(page, request, FIRST_RUN_URL, { name: 'Anu' });
  await page.goto('/settings/users');
  await page.locator('.hl-list-row', { hasText: 'Anu' }).getByRole('button', { name: 'Reset password' }).click();
  const dialog = page.getByRole('dialog', { name: "Reset Anu's password" });
  const field = dialog.getByRole('textbox', { name: 'Reset link' });
  await expect(field).toHaveValue(/\/reset\/[A-Za-z0-9_-]{43}$/);
  const path = `/reset/${(await field.inputValue()).split('/reset/')[1]}`;
  await dialog.getByRole('button', { name: 'Done' }).click();

  const member = await (await browser.newContext({ baseURL: FIRST_RUN_URL })).newPage();
  await member.goto(path);
  await expect(member.getByRole('heading', { level: 1, name: 'Choose a new password' })).toBeVisible();
  expect((await new AxeBuilder({ page: member }).analyze()).violations).toEqual([]);
  await member.getByLabel('New password').fill('short');
  await expect(member.getByText('Use at least 12 characters.')).toBeVisible();
  await member.getByLabel('New password').fill('a brand new long passphrase');
  await member.getByRole('button', { name: 'Set password' }).click();
  await expect(member).toHaveURL(/\/$/);

  // Used once: opening it again and submitting says it has expired.
  const again = await (await browser.newContext({ baseURL: FIRST_RUN_URL })).newPage();
  await again.goto(path);
  await again.getByLabel('New password').fill('another long passphrase');
  await again.getByRole('button', { name: 'Set password' }).click();
  await expect(again.getByText('This link has expired. Ask your admin for a new one.')).toBeVisible();
  await expect(again.getByRole('link', { name: 'Back to log in' }).first()).toBeVisible();
});
