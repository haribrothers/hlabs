// US-ONB-13 · Skip two-factor for now (first-run instance).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createAdminInUi, turnOnTwoFactor } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test.describe('US-ONB-13', () => {
  test('Skip for now warns, then moves on to storage with two-factor off', async ({ page, request }) => {
    await createAdminInUi(page, request);
    await page.getByRole('button', { name: 'Skip for now' }).click();
    const dialog = page.getByRole('dialog', { name: 'Skip two-factor login?' });
    await expect(dialog).toContainText('Anyone who learns your password can manage hlabs.');
    await dialog.getByRole('button', { name: 'Skip' }).click();
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/storage`);

    // Asked from the page, so the browser's session cookie goes with it.
    const totpEnabled = await page.evaluate(async () => {
      const res = await fetch('/trpc/auth.me');
      return ((await res.json()) as { result: { data: { totpEnabled: boolean } } }).result.data.totpEnabled;
    });
    expect(totpEnabled).toBe(false);
  });

  test('back on two-factor after turning it on shows "Two-factor is on", not the QR code', async ({
    page,
    request,
  }) => {
    await createAdminInUi(page, request);
    await turnOnTwoFactor(page);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/storage`);

    // Back from storage arrives with US-ONB-14; going to the earlier step is the same route.
    await page.goto('/setup/twoFactor');
    await expect(page.getByRole('heading', { level: 1, name: 'Two-factor is on' })).toBeVisible();
    await expect(page.getByAltText('QR code for your authenticator app')).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/storage`);
  });
});
