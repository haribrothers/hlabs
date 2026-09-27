// Walks the first-run instance to a later onboarding step through the real screens.
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { FIRST_RUN_URL, resetOnboarding } from './instances';

export const ADMIN = { name: 'Hari Prasad', username: 'hari', password: 'correct horse battery' };

/** Fresh first run, then create the admin in the UI: the browser ends signed in on the two-factor step. */
export async function createAdminInUi(page: Page, request: APIRequestContext) {
  await page.goto(await resetOnboarding(request, 'account'));
  await page.getByLabel('Your name').fill(ADMIN.name);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await page.getByLabel('Confirm password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/twoFactor`);
}

/** On the two-factor step: reads the key, enters the current code and returns the recovery codes shown. */
export async function turnOnTwoFactor(page: Page): Promise<string[]> {
  const { generateSync } = await import('otplib');
  await page.getByRole('button', { name: "Can't scan? Enter this key instead" }).click();
  const secret = (await page.getByLabel('Setup key').innerText()).replace(/\s/g, '');
  const code = generateSync({ secret });
  for (let i = 0; i < 6; i++) await page.getByLabel(`Digit ${i + 1}`).fill(code[i]!);
  const list = page.getByRole('list', { name: 'Recovery codes' });
  await expect(list.getByRole('listitem')).toHaveCount(10);
  return list.getByRole('listitem').allInnerTexts();
}

/** On the two-factor step: Skip for now, confirmed; ends on the storage step. */
export async function skipTwoFactor(page: Page) {
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Skip' }).click();
  await expect(page).toHaveURL(/\/setup\/storage$/);
}
