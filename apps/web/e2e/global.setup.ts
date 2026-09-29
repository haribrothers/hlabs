// Takes the main instance past onboarding and signs a browser in, so dashboard specs reach Home. Uses the dev-only
// shortcuts; the onboarding and log-in specs walk the real flows on the first-run instance. Note: locally this reuses
// a running `pnpm dev`, so it completes onboarding in .dev-data too (and signs in as its first admin).
import { expect, test as setup } from '@playwright/test';
import { MAIN_URL, MAIN_STORAGE_STATE } from './instances';

setup('complete onboarding on the main instance and sign in', async ({ request, page }) => {
  const res = await request.post(`${MAIN_URL}/dev/complete-onboarding`);
  expect(res.ok()).toBe(true);
  await page.goto(`${MAIN_URL}/dev/sign-in`);
  await expect(
    page.getByRole('navigation', { name: 'Dock' }).or(page.getByRole('navigation', { name: 'Tab bar' })),
  ).toBeVisible();
  await page.context().storageState({ path: MAIN_STORAGE_STATE });
});
