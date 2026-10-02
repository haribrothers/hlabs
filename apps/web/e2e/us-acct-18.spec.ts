// US-ACCT-18 · Choose what the log-in screen shows (first-run instance: the admin's switch, a signed-out browser).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ACCT-18 with the list of users off, the log-in screen asks for a username', async ({
  page,
  request,
  browser,
}, info) => {
  await finishOnboarding(page, request);
  await page.goto('/settings/users');
  const sw = page.getByRole('group', { name: 'Log-in screen' }).getByRole('switch', { name: 'Show the list of users' });
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await Promise.all([page.waitForResponse((r) => r.url().includes('users.updatePolicy')), sw.click()]);
  await expect(sw).toHaveAttribute('aria-checked', 'false');

  const guest = await (await browser.newContext({ ...info.project.use, baseURL: FIRST_RUN_URL })).newPage();
  await guest.goto('/login');
  await expect(guest).toHaveURL(/\/login\/username/);
  await expect(guest.getByText(ADMIN.name)).toHaveCount(0);

  await Promise.all([page.waitForResponse((r) => r.url().includes('users.updatePolicy')), sw.click()]);
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await guest.goto('/login/users');
  await expect(guest.getByText(ADMIN.name)).toBeVisible();
});
