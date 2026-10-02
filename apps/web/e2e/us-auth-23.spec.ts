// US-AUTH-23 · Open an invite link (first-run instance: its admin makes the invite, a signed-out browser opens it).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createInvite } from './invites';
import { ADMIN, finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-AUTH-23 a signed-out browser sees who invited them; a dead link says so', async ({
  page,
  request,
  browser,
}, info) => {
  await finishOnboarding(page, request);
  const path = await createInvite(page, { name: 'Anu' });
  const guest = await (await browser.newContext({ ...info.project.use, baseURL: FIRST_RUN_URL })).newPage();
  await guest.goto(path);
  await expect(guest.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
  await expect(guest.getByText(`${ADMIN.name} invited you to`)).toBeVisible();
  await expect(guest.getByText("You'll get your own Home screen and a private Files folder.")).toBeVisible();
  await expect(guest.getByText(/You're logged in as/)).toHaveCount(0);
  if (process.env.HLABS_SHOTS)
    await guest.screenshot({ path: `${process.env.HLABS_SHOTS}/accept-invite-${info.project.name}.png` });
  expect((await new AxeBuilder({ page: guest }).analyze()).violations).toEqual([]);

  await guest.goto('/invite/not-a-real-invite');
  await expect(guest.getByRole('heading', { name: "This invite doesn't work anymore" })).toBeVisible();
  await expect(guest.getByText('Ask your admin for a new link.')).toBeVisible();
  await guest.getByRole('link', { name: 'Go to log in' }).click();
  await expect(guest).toHaveURL(/\/login/);
});

test('US-AUTH-23 opened while signed in: "You\'re logged in as" first', async ({ page, request }) => {
  await finishOnboarding(page, request);
  const path = await createInvite(page);
  await page.goto(path);
  await expect(page.getByText("You're logged in as @hari.")).toBeVisible();
  await page.getByRole('button', { name: 'Log out and continue' }).click();
  await expect(page.getByText("You're logged in as @hari.")).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Join hlabs' })).toBeVisible();
});
