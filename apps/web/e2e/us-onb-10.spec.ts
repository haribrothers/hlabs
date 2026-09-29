// US-ONB-10 · Only allow one admin to be created through onboarding (first-run instance).
import { expect, test, type Page } from '@playwright/test';
import { FIRST_RUN_URL, resetOnboarding } from './instances';

test.use({ baseURL: FIRST_RUN_URL });

async function fillAccount(page: Page, name: string) {
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
  await page.getByLabel('Confirm password').fill('correct horse battery');
}

test('US-ONB-10 a stale setup tab is told an admin already exists', async ({ browser, request }) => {
  const url = await resetOnboarding(request, 'account');
  const first = await (await browser.newContext()).newPage();
  const stale = await (await browser.newContext()).newPage();
  await first.goto(url);
  await stale.goto(url);
  await fillAccount(first, 'Hari');
  await fillAccount(stale, 'Someone Else');

  await first.getByRole('button', { name: 'Create account' }).click();
  await expect(first).toHaveURL(`${FIRST_RUN_URL}/setup/twoFactor`);

  await stale.getByRole('button', { name: 'Create account' }).click();
  await expect(stale.getByText('An admin account already exists. Log in to continue.')).toBeVisible();
  await expect(stale.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  await expect(stale).toHaveURL(`${FIRST_RUN_URL}/setup/account`);
});
