// US-AUTH-14 · Stay signed in, or not (first-run instance, after onboarding).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-AUTH-14 remember me decides how long this device stays signed in', async ({ page, request, browser }) => {
  await finishOnboarding(page, request);
  const context = await browser.newContext({ baseURL: FIRST_RUN_URL });
  const other = await context.newPage();
  const sessionCookie = async () => (await context.cookies()).find((c) => c.name === 'hlabs_session')!;

  // Signed out on a dashboard page: log in, then back to it.
  await other.goto('/files');
  await expect(other).toHaveURL(/\/login\/(users|username)\?next=%2Ffiles$/);
  if (other.url().includes('/login/users')) {
    await other.getByRole('button', { name: /^Other user/ }).click();
    await expect(other).toHaveURL(/\/login\/username\?next=%2Ffiles$/);
  }
  await other.getByRole('textbox', { name: 'Username' }).fill(ADMIN.username);
  await other.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await other.getByRole('button', { name: 'Log in' }).click();
  await expect(other).toHaveURL(`${FIRST_RUN_URL}/files`);

  // Remember me off: the cookie ends with the browser session.
  let cookie = await sessionCookie();
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/', expires: -1 });

  // On (from the username form): 30 days; the remembered-account screen then reuses that choice.
  await context.clearCookies();
  await other.goto('/login/username');
  await other.getByLabel('Username').fill(ADMIN.username);
  await other.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await other.getByRole('switch', { name: 'Remember me on this device' }).click();
  await other.getByRole('button', { name: 'Log in' }).click();
  await expect(other).toHaveURL(`${FIRST_RUN_URL}/`);
  const thirtyDays = Date.now() / 1000 + 30 * 24 * 3600;
  expect(Math.abs((await sessionCookie()).expires - thirtyDays)).toBeLessThan(60);

  await context.clearCookies();
  await other.goto('/login');
  await expect(other.getByRole('heading', { level: 1, name: `Welcome back, ${ADMIN.name}` })).toBeVisible();
  await expect(other.getByRole('switch')).toHaveCount(0);
  await other.getByPlaceholder('Password').fill(ADMIN.password);
  await other.getByRole('button', { name: 'Log in' }).click();
  await expect(other).toHaveURL(`${FIRST_RUN_URL}/`);
  cookie = await sessionCookie();
  expect(Math.abs(cookie.expires - thirtyDays)).toBeLessThan(60);
});
