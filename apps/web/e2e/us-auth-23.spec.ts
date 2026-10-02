// US-AUTH-23 · Open an invite link (main instance: the admin makes the invite and another browser opens it). The main
// instance answers cookie-less requests as its development admin, so the signed-out view is covered by unit tests.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';
import { createInvite } from './invites';

test('US-AUTH-23 another browser sees who invited them; a dead link says so', async ({ page, browser }, info) => {
  const path = await createInvite(page);
  const guest = await (await browser.newContext({ baseURL: MAIN_URL, ...info.project.use })).newPage();
  await guest.goto(path);
  await expect(guest.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
  await expect(guest.getByText(/invited you to$/)).toBeVisible();
  await expect(guest.getByText("You'll get your own Home screen and a private Files folder.")).toBeVisible();
  // No Dock on this page.
  await expect(guest.getByRole('navigation', { name: /Dock|Sections/ })).toHaveCount(0);
  if (process.env.HLABS_SHOTS)
    await guest.screenshot({ path: `${process.env.HLABS_SHOTS}/accept-invite-${info.project.name}.png` });
  expect((await new AxeBuilder({ page: guest }).analyze()).violations).toEqual([]);

  await guest.goto('/invite/not-a-real-invite');
  await expect(guest.getByRole('heading', { name: "This invite doesn't work anymore" })).toBeVisible();
  await expect(guest.getByText('Ask your admin for a new link.')).toBeVisible();
  await guest.getByRole('link', { name: 'Go to log in' }).click();
  await expect(guest).toHaveURL(/\/login/);
});

test('US-AUTH-23 opened while signed in: "You\'re logged in as" first', async ({ page }) => {
  const path = await createInvite(page);
  await page.goto(path);
  await expect(page.getByText(/^You're logged in as @/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log out and continue' })).toBeVisible();
});
