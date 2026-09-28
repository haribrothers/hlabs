// US-SYS-18 · Restart the container engine (first-run instance: restarts are pretended there,
// HLABS_DEV_NO_ENGINE_CONTROL, so the real engine is never restarted).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-SYS-18 Restart engine asks first, runs as a job and comes back', async ({ page, request }) => {
  await finishOnboarding(page, request);
  await page.goto('/settings/engine');
  const restart = page.getByRole('button', { name: 'Restart engine' });
  const status = page.getByRole('status').filter({ hasText: /^Engine / });
  await expect(status).toBeVisible();
  test.skip((await status.innerText()) !== 'Engine running', 'needs a running engine on this machine');

  await restart.click();
  const dialog = page.getByRole('dialog', { name: 'Restart the container engine?' });
  await expect(dialog.getByText('All apps stop for about a minute.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Restart' }).click();
  await expect(dialog).toBeHidden();
  await expect(restart).toBeVisible({ timeout: 15_000 });
  await expect(status).toHaveText('Engine running');
});
