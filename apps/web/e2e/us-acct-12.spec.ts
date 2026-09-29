// US-ACCT-12 · Turn two-factor on or off (first-run instance, two-factor skipped during setup).
import { expect, test } from '@playwright/test';
import { generateSync } from 'otplib';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ACCT-12 turn two-factor on from Account, then off again', async ({ page, request }) => {
  test.setTimeout(90_000);
  await finishOnboarding(page, request);
  await page.goto('/settings/account');
  await expect(page.getByText('Off', { exact: true })).toBeVisible();

  // On: password, pair the app, then the new codes.
  await page.getByRole('button', { name: 'Turn on two-factor login' }).click();
  const pw = page.getByRole('dialog', { name: 'Turn on two-factor login' });
  await pw.getByLabel('Your password').fill(ADMIN.password);
  await pw.getByRole('button', { name: 'Confirm' }).click();
  const scan = page.getByRole('dialog', { name: 'Scan with your phone' });
  await scan.getByRole('button', { name: "Can't scan? Enter this key instead" }).click();
  const secret = (await scan.getByLabel('Setup key').innerText()).replace(/\s/g, '');
  const code = generateSync({ secret });
  for (let i = 0; i < 6; i++) await scan.getByLabel(`Digit ${i + 1}`).fill(code[i]!);
  const codes = page.getByRole('dialog').getByRole('list', { name: 'Recovery codes' }).getByRole('listitem');
  await expect(codes).toHaveCount(10);
  await expect(codes.first()).toHaveText(/^[a-z0-9]{4}-[a-z0-9]{4}$/);
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('On · authenticator app')).toBeVisible();

  // Off: warned, password and a current code.
  await page.getByRole('button', { name: 'Manage two-factor login' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Turn off two-factor…' }).click();
  const off = page.getByRole('alertdialog', { name: 'Turn off two-factor login?' });
  await expect(off.getByText('Anyone with your password will be able to log in.')).toBeVisible();
  await off.getByLabel('Your password').fill(ADMIN.password);
  await off.getByLabel('6-digit code or recovery code').fill(generateSync({ secret }));
  await off.getByRole('button', { name: 'Turn off' }).click();
  await expect(off).toBeHidden();
  await expect(page.getByText('Off', { exact: true })).toBeVisible();
  await expect(page.getByText('Recovery codes')).toHaveCount(0);
});
