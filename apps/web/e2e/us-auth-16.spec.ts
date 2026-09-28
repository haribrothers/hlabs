// US-AUTH-16 · Log out (first-run instance, after onboarding).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-AUTH-16 Log out ends this device only and lands on Login with my name', async ({
  page: setup,
  request,
  browser,
}) => {
  await finishOnboarding(setup, request);
  const context = await browser.newContext({ baseURL: FIRST_RUN_URL });
  const page = await context.newPage();
  await page.goto('/login/username?next=%2Fsettings');
  await page.getByLabel('Username').fill(ADMIN.username);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/settings`);

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login\/password\?user=hari$/);
  await expect(page.getByRole('heading', { level: 1, name: `Welcome back, ${ADMIN.name}` })).toBeVisible();
  await expect(page.getByText('You were logged out on this device.')).toHaveCount(0);
  expect((await context.cookies()).find((c) => c.name === 'hlabs_session')).toBeUndefined();

  // Signed out now: dashboard pages ask to log in. The other device (from onboarding) is still signed in.
  await page.goto('/files');
  await expect(page).toHaveURL(/\/login\/password\?user=hari&next=%2Ffiles$/);
  await setup.goto('/files');
  await expect(setup.getByRole('heading', { level: 1, name: 'Files' })).toBeVisible();
});
