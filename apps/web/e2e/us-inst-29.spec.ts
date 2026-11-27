// US-INST-29 · Use hlabs in its own window, against the dashboard built for production (the pwa project): opened where
// hlabs can't be reached, the saved shell shows "Can't reach hlabs" with what to check and Try again, and the page
// loads once hlabs answers.
import { expect, test } from '@playwright/test';

test('US-INST-29 offline, the saved shell says "Can\'t reach hlabs" and the page loads when hlabs answers', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(async () => navigator.serviceWorker.ready);
  // The worker has the shell; now nothing answers.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await context.setOffline(true);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: "Can't reach hlabs" })).toBeVisible();
  await expect(
    page.getByText('Check that this computer is on your home network or connected to Tailscale.'),
  ).toBeVisible();
  await expect(page.getByText('Make sure the computer hlabs runs on is on and awake.')).toBeVisible();
  await expect(page.getByRole('status')).toContainText(/Trying again in \d+ seconds?…/);

  await context.setOffline(false);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: "Can't reach hlabs" })).toBeHidden({ timeout: 15_000 });
  await expect(
    page.getByRole('heading', { name: /^(Good (morning|afternoon|evening)|Welcome to hlabs)/ }),
  ).toBeVisible();
});
