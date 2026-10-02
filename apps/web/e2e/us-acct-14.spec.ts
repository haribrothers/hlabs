// US-ACCT-14 · Give a member a reset-password link (first-run instance). The /reset page is US-AUTH-22 (phase 4); here
// the link is used through auth.resetPassword, as that page will.
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createMember } from './invites';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ACCT-14 the admin makes a link; the member sets a new password with it, once', async ({ page, request }) => {
  await finishOnboarding(page, request);
  const member = await createMember(page, request, FIRST_RUN_URL, { name: 'Anu' });
  await page.goto('/settings/users');
  await page.locator('.hl-list-row', { hasText: 'Anu' }).getByRole('button', { name: 'Reset password' }).click();
  const dialog = page.getByRole('dialog', { name: "Reset Anu's password" });
  const link = dialog.getByRole('textbox', { name: 'Reset link' });
  await expect(link).toHaveValue(/\/reset\/[A-Za-z0-9_-]{43}$/);
  await expect(dialog.getByText('Works once · expires in 15 minutes')).toBeVisible();
  const token = (await link.inputValue()).split('/reset/')[1];
  await dialog.getByRole('button', { name: 'Done' }).click();

  const reset = () =>
    request.post(`${FIRST_RUN_URL}/trpc/auth.resetPassword`, {
      data: { token, newPassword: 'a brand new long passphrase' },
    });
  expect((await reset()).ok()).toBe(true);
  expect((await reset()).ok()).toBe(false);
  const login = await request.post(`${FIRST_RUN_URL}/trpc/auth.login`, {
    data: { username: member.username, password: 'a brand new long passphrase' },
  });
  expect(login.ok()).toBe(true);
});
