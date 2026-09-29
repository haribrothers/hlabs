// US-AUTH-01 · Pick my account from the user list (first-run instance, after onboarding).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-AUTH-01 choose your account from the list, then the password screen greets you', async ({
  page,
  request,
  browser,
}) => {
  await finishOnboarding(page, request);

  // Another browser, signed out.
  const other = await (await browser.newContext({ baseURL: FIRST_RUN_URL })).newPage();
  await other.goto('/login/users');
  await expect(other.getByRole('heading', { level: 1, name: "Who's using hlabs?" })).toBeVisible();
  const hari = other.getByRole('button', { name: 'Hari Prasad, Admin' });
  await expect(hari).toBeVisible();
  await expect(other.getByRole('navigation', { name: 'Dock' })).toHaveCount(0);
  expect((await new AxeBuilder({ page: other }).analyze()).violations).toEqual([]);

  await hari.focus();
  await other.keyboard.press('Enter');
  await expect(other).toHaveURL(/\/login\/password\?user=hari$/);
  await expect(other.getByRole('heading', { level: 1, name: 'Welcome back, Hari Prasad' })).toBeVisible();
  await expect(other.getByText('@hari · Admin')).toBeVisible();
  await expect(other.getByPlaceholder('Password')).toBeFocused();
});
