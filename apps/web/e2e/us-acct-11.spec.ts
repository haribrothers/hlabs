// US-ACCT-11 · Move two-factor to a new phone (first-run instance, two-factor on during setup).
import { expect, test } from '@playwright/test';
import { generateSync } from 'otplib';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboardingWithTwoFactor, passwordStep } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ACCT-11 pair a new phone; log-in codes then come from it', async ({ page, request, browser }) => {
  test.setTimeout(90_000);
  await finishOnboardingWithTwoFactor(page, request);
  await page.goto('/settings/account');
  await page.getByRole('button', { name: 'Manage two-factor login' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Move to a new phone' }).click();
  const pw = page.getByRole('dialog', { name: 'Move to a new phone' });
  await pw.getByLabel('Your password').fill(ADMIN.password);
  await pw.getByRole('button', { name: 'Confirm' }).click();

  const scan = page.getByRole('dialog', { name: 'Scan with your new phone' });
  await expect(scan.getByAltText('QR code for your authenticator app')).toBeVisible();
  await scan.getByRole('button', { name: "Can't scan? Enter this key instead" }).click();
  const secret = (await scan.getByLabel('Setup key').innerText()).replace(/\s/g, '');
  const code = generateSync({ secret });
  for (let i = 0; i < 6; i++) await scan.getByLabel(`Digit ${i + 1}`).fill(code[i]!);
  await expect(page.getByRole('status').filter({ hasText: 'Two-factor moved to your new phone' })).toBeVisible();

  // Logging in elsewhere now takes a code from the new phone.
  const other = await (await browser.newContext({ baseURL: FIRST_RUN_URL })).newPage();
  await passwordStep(other, '/');
  const next = generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + 30 });
  for (let i = 0; i < 6; i++) await other.getByLabel(`Digit ${i + 1}`).fill(next[i]!);
  await expect(other).toHaveURL(`${FIRST_RUN_URL}/`);
});
