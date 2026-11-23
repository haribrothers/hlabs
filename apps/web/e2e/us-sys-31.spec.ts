// US-SYS-31 · Restart hlabs (first-run instance, which e2e starts again on exit 75 as launchd and systemd do):
// "Restart" asks "Restart all apps?", the page shows "Restarting hlabs…" and comes back on its own once hlabs answers.
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-SYS-31 Restart asks first, shows "Restarting hlabs…" and reconnects', async ({ page, request }) => {
  test.setTimeout(120_000);
  await finishOnboarding(page, request);
  await page.goto('/settings/advanced');
  const danger = page.getByRole('group', { name: 'Danger zone' });
  await expect(danger).toContainText('Stops and starts every app · about 1 minute');
  await danger.getByRole('button', { name: 'Restart' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Restart all apps?' });
  await expect(dialog).toContainText(
    'Apps will be unavailable for about a minute. Anyone watching or syncing will be disconnected.',
  );
  await dialog.getByRole('button', { name: 'Restart' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Restarting hlabs…' })).toBeVisible();
  // Back: the page loads again where it was, signed in.
  await expect(page.getByRole('heading', { level: 1, name: 'Advanced' })).toBeVisible({ timeout: 90_000 });
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/settings/advanced`);
});
