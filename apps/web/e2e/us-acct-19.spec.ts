// US-ACCT-19 · Require two-factor for everyone (first-run instance).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createMember } from './invites';
import { finishOnboarding, finishOnboardingWithTwoFactor } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ACCT-19 without my own two-factor, the switch sends me to set it up first', async ({ page, request }) => {
  await finishOnboarding(page, request);
  await page.goto('/settings/users');
  const sw = page.getByRole('switch', { name: 'Require two-factor for everyone' });
  await sw.click();
  const dialog = page.getByRole('dialog', { name: 'Turn on two-factor for your own account first.' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await sw.click();
  await dialog.getByRole('button', { name: 'Set up two-factor' }).click();
  await expect(page).toHaveURL(/\/settings\/account\/two-factor/);
});

test('US-ACCT-19 with it on, a member without two-factor must set it up after logging in', async ({
  page,
  request,
  browser,
}, info) => {
  await finishOnboardingWithTwoFactor(page, request);
  const member = await createMember(page, request, FIRST_RUN_URL, { name: 'Anu' });
  await page.goto('/settings/users');
  const sw = page.getByRole('switch', { name: 'Require two-factor for everyone' });
  await Promise.all([page.waitForResponse((r) => r.url().includes('users.updatePolicy')), sw.click()]);
  await expect(sw).toHaveAttribute('aria-checked', 'true');

  const anu = await (await browser.newContext({ ...info.project.use, baseURL: FIRST_RUN_URL })).newPage();
  await anu.goto('/login/username');
  await anu.getByLabel('Username').fill(member.username);
  await anu.getByLabel('Password', { exact: true }).fill(member.password);
  await anu.getByRole('button', { name: 'Log in' }).click();
  await expect(anu).toHaveURL(/\/settings\/account\/two-factor/);
});
