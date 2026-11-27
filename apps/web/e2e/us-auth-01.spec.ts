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
}, info) => {
  await finishOnboarding(page, request);

  // Another browser, signed out.
  const other = await (await browser.newContext({ baseURL: FIRST_RUN_URL })).newPage();
  await other.goto('/login/users');
  // A phone titles the page "Log in to hlabs", with "Who's using hlabs?" over the list (PhoneRedesignA_Login).
  if (info.project.name.includes('phone')) {
    await expect(other.getByRole('heading', { level: 1, name: 'Log in to hlabs' })).toBeVisible();
    await expect(other.getByRole('group', { name: "Who's using hlabs?" })).toBeVisible();
  } else await expect(other.getByRole('heading', { level: 1, name: "Who's using hlabs?" })).toBeVisible();
  const hari = other.getByRole('button', { name: 'Hari Prasad, Admin' });
  await expect(hari).toBeVisible();
  await expect(other.getByRole('navigation', { name: 'Dock' })).toHaveCount(0);
  expect((await new AxeBuilder({ page: other }).analyze()).violations).toEqual([]);

  await hari.focus();
  await other.keyboard.press('Enter');
  if (info.project.name.includes('phone')) {
    // On a phone the account is chosen in place, with the password under the list (US-PHONE-05).
    await expect(hari).toHaveAttribute('aria-pressed', 'true');
    await expect(other.getByPlaceholder('Password')).toBeFocused();
    return;
  }
  await expect(other).toHaveURL(/\/login\/password\?user=hari$/);
  await expect(other.getByRole('heading', { level: 1, name: 'Welcome back, Hari Prasad' })).toBeVisible();
  await expect(other.getByText('@hari · Admin')).toBeVisible();
  await expect(other.getByPlaceholder('Password')).toBeFocused();
});
