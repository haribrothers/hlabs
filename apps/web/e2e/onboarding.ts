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

/** On the two-factor step: reads the key, enters the current code and returns the recovery codes shown, with the key. */
export async function turnOnTwoFactor(page: Page): Promise<string[] & { secret: string }> {
  const { generateSync } = await import('otplib');
  await page.getByRole('button', { name: "Can't scan? Enter this key instead" }).click();
  const secret = (await page.getByLabel('Setup key').innerText()).replace(/\s/g, '');
  const code = generateSync({ secret });
  for (let i = 0; i < 6; i++) await page.getByLabel(`Digit ${i + 1}`).fill(code[i]!);
  const list = page.getByRole('list', { name: 'Recovery codes' });
  await expect(list.getByRole('listitem')).toHaveCount(10);
  return Object.assign(await list.getByRole('listitem').allInnerTexts(), { secret });
}

/** On the two-factor step: Skip for now, confirmed; ends on the storage step. */
export async function skipTwoFactor(page: Page) {
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Skip' }).click();
  await expect(page).toHaveURL(/\/setup\/storage$/);
}

/** On the remote access step (phase 3): Set up later; ends on the starter apps. */
export async function remoteLater(page: Page) {
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/remote`);
  await page.getByRole('button', { name: 'Set up later' }).click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/apps`);
}

/**
 * On the storage step: Continue with This computer, Set up later for remote access, then Skip on the starter apps;
 * ends on the finish screen.
 */
export async function storageThenSkipApps(page: Page) {
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/storage`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await remoteLater(page);
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/done`);
}

/**
 * A finished first run in one call (the dev-only seed): admin "hari" (two-factor off unless asked) with data on this
 * computer, then this browser signed in as them and on Home. Specs about onboarding itself walk the real screens.
 */
async function seed(page: Page, request: APIRequestContext, twoFactor: boolean) {
  const res = await request.post(`${FIRST_RUN_URL}/dev/seed`, {
    data: { username: ADMIN.username, displayName: ADMIN.name, password: ADMIN.password, twoFactor },
  });
  expect(res.ok()).toBe(true);
  const seeded = (await res.json()) as { secret: string | null; recoveryCodes: string[] };
  await page.goto(`${FIRST_RUN_URL}/dev/sign-in`);
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/`);
  return seeded;
}

/** A finished first run: admin "hari" (two-factor skipped) with data on this computer. The page ends on Home. */
export async function finishOnboarding(page: Page, request: APIRequestContext) {
  await seed(page, request, false);
}

/** A finished first run with two-factor on (as if during setup): returns its recovery codes and key. On Home. */
export async function finishOnboardingWithTwoFactor(page: Page, request: APIRequestContext) {
  const { secret, recoveryCodes } = await seed(page, request, true);
  return Object.assign(recoveryCodes, { secret: secret! });
}

/** In a fresh browser: username and password for the admin, ending on the code step. */
export async function passwordStep(page: Page, next = '/settings') {
  await page.goto(`/login/username?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Username').fill(ADMIN.username);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/login\/code\?/);
}
