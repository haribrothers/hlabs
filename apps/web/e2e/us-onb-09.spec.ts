// US-ONB-09 · See what to fix when the account details are invalid (first-run instance).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL, resetOnboarding } from './instances';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ONB-09 counts what to fix, focuses the first field and clears errors as they are fixed', async ({
  page,
  request,
}) => {
  await page.goto(await resetOnboarding(request, 'account'));
  await page.getByLabel('Your name').fill('Hari');
  await page.getByLabel('Username').fill('Hari Prasad');
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByLabel('Confirm password').fill('shorter');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByText('Fix 3 things to continue.')).toBeVisible();
  await expect(page.getByLabel('Username')).toBeFocused();
  await expect(page.getByLabel('Username')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Weak · use at least 12 characters')).toBeVisible();
  await expect(page.getByText("Passwords don't match")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByLabel('Username').fill('hari');
  await expect(page.getByText('Fix 2 things to continue.')).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
  await page.getByLabel('Confirm password').fill('correct horse battery');
  await expect(page.getByText(/to continue\./)).toHaveCount(0);
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/account`);
});
