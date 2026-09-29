// US-ONB-15 · Use an external drive (first-run instance). Drives differ per machine (none on CI), so this checks
// the list appears and never picks a drive: that would write to a real disk.
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createAdminInUi, skipTwoFactor } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ONB-15 choosing External drive lists connected drives, or asks to connect one', async ({ page, request }) => {
  await createAdminInUi(page, request);
  await skipTwoFactor(page);
  await page.getByRole('radio', { name: /External drive/ }).click();
  const list = page.getByRole('radiogroup', { name: 'Connected drives' });
  const none = page.getByText('Connect a drive to see it here.');
  await expect(list.or(none)).toBeVisible();
  if (await list.isVisible()) {
    await expect(list.getByRole('radio').first()).toContainText(/ free · /);
  }
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
});
