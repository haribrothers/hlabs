// US-PHONE-05 · Log in on a phone (first-run instance, after onboarding): the form with "Remember this phone" off, a
// full-width Log in and Forgot password?, fields password managers fill, the host in the footer; Go logs in, and
// with the switch on the session lasts 30 days.
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboarding } from './onboarding';
import { box, phoneOnly, tabBar } from './phone';

test.use({ baseURL: FIRST_RUN_URL });

test('US-PHONE-05 the phone log-in form, and Go with "Remember this phone" on', async ({
  page,
  request,
  context,
}, info) => {
  phoneOnly(info);
  await finishOnboarding(page, request);
  await context.clearCookies();
  await page.goto('/login/username?next=%2Fsettings');
  await expect(page.getByRole('heading', { level: 1, name: 'Log in to hlabs' })).toBeVisible();
  const user = page.getByLabel('Username');
  const password = page.getByLabel('Password', { exact: true });
  await expect(user).toHaveAttribute('autocapitalize', 'none');
  await expect(user).toHaveAttribute('autocorrect', 'off');
  await expect(user).toHaveAttribute('autocomplete', 'username');
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  await expect(page.getByRole('button', { name: 'Show password' })).toBeVisible();
  const remember = page.getByRole('switch', { name: 'Remember this phone' });
  await expect(remember).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
  const logIn = page.getByRole('button', { name: 'Log in' });
  // Full width: as wide as the fields' inset group (D-172).
  expect((await box(logIn)).width).toBeCloseTo((await box(page.locator('.hl-p-group').first())).width, 0);
  // The footer: only the host here (not a tailnet name).
  await expect(page.getByRole('contentinfo')).toContainText(new URL(FIRST_RUN_URL).host);
  await expect(page.getByRole('contentinfo')).not.toContainText('via Tailscale');

  await user.fill(ADMIN.username);
  await password.fill(ADMIN.password);
  await remember.click();
  await password.press('Enter');
  await expect(page).toHaveURL(new RegExp(`^${FIRST_RUN_URL}/settings(/account)?$`));
  await expect(tabBar(page)).toBeVisible();
  const session = (await context.cookies()).find((c) => c.httpOnly);
  expect(session).toBeDefined();
  expect(session!.expires * 1000 - Date.now()).toBeGreaterThan(29 * 24 * 3600 * 1000);
});

test('US-PHONE-05 a wrong password says so under the field', async ({ page, request, context }, info) => {
  phoneOnly(info);
  await finishOnboarding(page, request);
  await context.clearCookies();
  await page.goto('/login/username');
  await page.getByLabel('Username').fill(ADMIN.username);
  await page.getByLabel('Password', { exact: true }).fill('not the password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Username or password is incorrect.')).toBeVisible();
});
