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
