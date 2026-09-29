// US-ACCT-10 · Make new recovery codes (first-run instance, two-factor on during setup).
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboardingWithTwoFactor } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ACCT-10 new codes show once in plain text and download', async ({ page, request }) => {
  test.setTimeout(90_000);
  await finishOnboardingWithTwoFactor(page, request);
  await page.goto('/settings/account');
  await page.getByRole('button', { name: 'View recovery codes' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Make new codes' }).click();
  const confirm = page.getByRole('dialog', { name: 'Make new codes' });
  await expect(confirm.getByText('Your old codes will stop working.')).toBeVisible();
  await confirm.getByLabel('Your password').fill(ADMIN.password);
  await confirm.getByRole('button', { name: 'Make new codes' }).click();

  const dialog = page.getByRole('dialog');
  const codes = dialog.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem');
  await expect(codes).toHaveCount(10);
  await expect(codes.first()).toHaveText(/^[a-z0-9]{4}-[a-z0-9]{4}$/);
  await expect(dialog.getByText('Recovery codes · 10 of 10 unused')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`hlabs-recovery-codes-${ADMIN.username}.txt`);
  const text = await readFile((await download.path())!, 'utf8');
  expect(text).toContain(await codes.first().innerText());

  // Closed and opened again: masked.
  await dialog.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'View recovery codes' }).click();
  await expect(page.getByRole('dialog').getByRole('listitem').first()).toHaveText('••••-••••');
});
