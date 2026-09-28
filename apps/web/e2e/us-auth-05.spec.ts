// US-AUTH-05 · Open the right login screen (first-run instance, after onboarding).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-AUTH-05 /login opens the screen that fits: signed in, fresh device, remembered user', async ({
  page,
  request,
  browser,
}) => {
  await finishOnboarding(page, request);

  // Signed in: straight on to next, no form.
  await page.goto('/login?next=%2Fsettings');
  await expect(page).toHaveURL(new RegExp(`^${FIRST_RUN_URL}/settings(/account)?$`));

  // A device nobody has logged in on: the list of accounts.
  const context = await browser.newContext({ baseURL: FIRST_RUN_URL });
  const fresh = await context.newPage();
  await fresh.goto('/login?next=%2Ffiles');
  await expect(fresh).toHaveURL(/\/login\/users\?next=%2Ffiles$/);

  // Log in once, then lose the session: /login greets the remembered account.
  await fresh.getByRole('button', { name: 'Hari Prasad, Admin' }).click();
  await fresh.getByPlaceholder('Password').fill(ADMIN.password);
  await fresh.getByRole('button', { name: 'Log in' }).click();
  await expect(fresh).toHaveURL(`${FIRST_RUN_URL}/files`);
  await context.clearCookies();
  await fresh.goto('/login');
  await expect(fresh).toHaveURL(/\/login\/password\?user=hari$/);
  await expect(fresh.getByRole('heading', { level: 1, name: 'Welcome back, Hari Prasad' })).toBeVisible();
});
