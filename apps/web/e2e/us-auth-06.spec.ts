// US-AUTH-06 · Log back in as the remembered user (first-run instance, after onboarding).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-AUTH-06 the remembered account only needs its password', async ({ page, request, browser }) => {
  await finishOnboarding(page, request);
  const context = await browser.newContext({ baseURL: FIRST_RUN_URL });
  const other = await context.newPage();
  await other.goto('/login/users');
  await other.getByRole('button', { name: 'Hari Prasad, Admin' }).click();
  await other.getByPlaceholder('Password').fill(ADMIN.password);
  await other.getByRole('button', { name: 'Log in' }).click();
  await expect(other).toHaveURL(`${FIRST_RUN_URL}/`);
  await context.clearCookies();

  await other.goto('/login');
  await expect(other.getByRole('heading', { level: 1, name: 'Welcome back, Hari Prasad' })).toBeVisible();
  await expect(other.getByText('@hari · Admin')).toBeVisible();
  await expect(other.getByPlaceholder('Password')).toBeFocused();
  await expect(other.getByRole('link', { name: 'Not Hari Prasad? Use another account' })).toBeVisible();
  expect((await new AxeBuilder({ page: other }).analyze()).violations).toEqual([]);

  await other.getByPlaceholder('Password').fill('not the password');
  await other.getByRole('button', { name: 'Log in' }).click();
  await expect(other.getByText('Password is incorrect.')).toBeVisible();
  await expect(other.getByPlaceholder('Password')).toHaveValue('');

  await other.getByPlaceholder('Password').fill(ADMIN.password);
  await other.getByPlaceholder('Password').press('Enter');
  await expect(other).toHaveURL(`${FIRST_RUN_URL}/`);
});
