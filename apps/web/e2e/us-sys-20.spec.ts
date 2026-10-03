// US-SYS-20 · Control startup behaviour (first-run instance, after setup).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-SYS-20 startup switches are on after setup and a change is kept', async ({ page, request }) => {
  await finishOnboarding(page, request);
  await page.goto('/settings/engine');
  const startup = page.getByRole('group', { name: 'Startup' });
  const autostart = startup.getByRole('switch', { name: 'Start apps automatically' });
  const awake = startup.getByRole('switch', { name: 'Keep this computer awake' });
  await expect(autostart).toBeChecked();
  await expect(awake).toBeChecked();
  // The menu-bar app applies start at login (phase 4, US-INST-09).
  await expect(startup.getByRole('switch', { name: 'Start hlabs when I log in' })).toBeVisible();

  await awake.click();
  await expect(awake).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Keep this computer awake' })).not.toBeChecked();
});
