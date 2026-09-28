// US-AUTH-02 · Log in as another user (first-run instance, after onboarding). The hidden list is covered by the
// server and component tests until Settings › Users can hide it.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-AUTH-02 Other user opens the username form, and All users goes back', async ({ page, request, browser }) => {
  await finishOnboarding(page, request);
  const other = await (await browser.newContext({ baseURL: FIRST_RUN_URL })).newPage();
  await other.goto('/login/users?next=%2Ffiles');
  await other.getByRole('button', { name: 'Other user, Enter username' }).click();
  await expect(other).toHaveURL(/\/login\/username\?next=%2Ffiles$/);
  await expect(other.getByRole('heading', { level: 1, name: 'Log in to hlabs' })).toBeVisible();
  await expect(other.getByLabel('Username')).toBeFocused();
  await expect(other.getByLabel('Username')).toHaveValue('');
  expect((await new AxeBuilder({ page: other }).analyze()).violations).toEqual([]);

  await other.getByRole('link', { name: 'All users' }).click();
  await expect(other).toHaveURL(/\/login\/users\?next=%2Ffiles$/);
});
