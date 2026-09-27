// Takes the main instance past onboarding so dashboard specs reach Home. Uses the dev-only shortcut until
// the onboarding stories can complete it through the UI (then this walks the real flow). Note: locally
// this reuses a running `pnpm dev`, so it completes onboarding in .dev-data too.
import { expect, test as setup } from '@playwright/test';
import { MAIN_URL } from './instances';

setup('complete onboarding on the main instance', async ({ request }) => {
  const res = await request.post(`${MAIN_URL}/dev/complete-onboarding`);
  expect(res.ok()).toBe(true);
});
