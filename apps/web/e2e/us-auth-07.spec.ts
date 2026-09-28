// US-AUTH-07 · Switch to another account (first-run instance, after onboarding).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-AUTH-07 Use another account forgets the remembered account', async ({ page, request, browser }) => {
  await finishOnboarding(page, request);
  const context = await browser.newContext({ baseURL: FIRST_RUN_URL });
  const other = await context.newPage();
  await other.goto('/login/username');
  await other.getByLabel('Username').fill('hari');
  await other.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await other.getByRole('button', { name: 'Log in' }).click();
  await expect(other).toHaveURL(`${FIRST_RUN_URL}/`);
  await context.clearCookies();

  await other.goto('/login?next=%2Ffiles');
  await expect(other.getByRole('heading', { level: 1, name: 'Welcome back, Hari Prasad' })).toBeVisible();
  await other.getByRole('link', { name: 'All users' }).waitFor();
  await other.getByRole('link', { name: 'Not Hari Prasad? Use another account' }).click();
  await expect(other).toHaveURL(/\/login\/users\?next=%2Ffiles$/);
  expect(await other.evaluate(() => localStorage.getItem('hlabs.lastUser'))).toBeNull();

  // With nobody remembered, /login opens the list again.
  await other.goto('/login');
  await expect(other).toHaveURL(/\/login\/users$/);
});
