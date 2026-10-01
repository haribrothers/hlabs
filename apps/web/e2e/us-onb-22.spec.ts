// US-ONB-22 · Finish onboarding and open the dashboard. The whole first run, end to end (phase 1 "Done when": a
// clean data dir → onboarding → Home). Needs a running container engine for the system check.
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL, resetOnboarding } from './instances';
import { ADMIN, storageThenSkipApps, turnOnTwoFactor } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ONB-22 a fresh install onboards end to end and opens Home, signed in', async ({ page, request }) => {
  test.setTimeout(90_000);
  await page.goto(await resetOnboarding(request, 'welcome'));

  // Welcome → system check.
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/system`);
  const list = page.getByRole('group');
  await expect(list.getByText('Checking…')).toHaveCount(0, { timeout: 20_000 });
  const cont = page.getByRole('button', { name: 'Continue' });
  test.skip(!(await cont.isEnabled()), 'no container engine running on this machine');
  await cont.click();

  // Admin account → two-factor → recovery codes → storage → starter apps (skipped).
  await page.getByLabel('Your name').fill(ADMIN.name);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await page.getByLabel('Confirm password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/twoFactor`);
  await turnOnTwoFactor(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await storageThenSkipApps(page);

  // Finish → Home, still signed in.
  await expect(page.getByRole('heading', { level: 1, name: "You're all set, Hari" })).toBeVisible();
  await page.getByRole('button', { name: 'Open dashboard' }).click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/`);
  // The dashboard shell: the Dock on a desktop, the tab bar on a phone.
  await expect(
    page.getByRole('navigation', { name: 'Dock' }).or(page.getByRole('navigation', { name: 'Tab bar' })),
  ).toBeVisible();
  const username = await page.evaluate(async () => {
    const res = await fetch('/trpc/auth.me');
    return ((await res.json()) as { result: { data: { username: string } } }).result.data.username;
  });
  expect(username).toBe(ADMIN.username);

  // Setup is gone: the finish screen, or any step, goes Home.
  await page.goto('/setup/done');
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/`);
  await page.goto('/setup/account');
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/`);
});
