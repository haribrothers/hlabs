// US-AUTH-15 · Get signed out when my session is revoked (first-run instance, after onboarding).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-AUTH-15 a device whose session is revoked goes to log in within 5 seconds', async ({
  page: setup,
  request,
  browser,
}) => {
  await finishOnboarding(setup, request);
  const page = await (await browser.newContext({ baseURL: FIRST_RUN_URL })).newPage();
  await page.goto('/login/username?next=%2Ffiles');
  await page.getByLabel('Username').fill(ADMIN.username);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/files`);
  await expect(page.getByRole('heading', { level: 1, name: 'Files' })).toBeVisible();

  const res = await request.post(`${FIRST_RUN_URL}/dev/revoke-sessions`, { data: { username: ADMIN.username } });
  expect(res.ok()).toBe(true);

  await expect(page).toHaveURL(/\/login\/password\?user=hari$/, { timeout: 5000 });
  await expect(page.getByRole('status').filter({ hasText: 'You were logged out on this device.' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: `Welcome back, ${ADMIN.name}` })).toBeVisible();
});
