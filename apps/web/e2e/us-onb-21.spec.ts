// US-ONB-21 · See a summary when setup is done (first-run instance). Also covers US-ONB-13's "2FA off".
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createAdminInUi, skipTwoFactor, turnOnTwoFactor } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

async function finish(page: Page) {
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/storage`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/done`);
}

test.describe('US-ONB-21', () => {
  test('summary after turning two-factor on', async ({ page, request }) => {
    await createAdminInUi(page, request);
    await turnOnTwoFactor(page);
    await page.getByRole('button', { name: 'Continue' }).click();
    await finish(page);

    await expect(page.getByRole('heading', { level: 1, name: "You're all set, Hari" })).toBeVisible();
    await expect(page.getByText('hlabs keeps running from the menu bar.')).toBeVisible();
    const summary = page.getByRole('group', { name: 'What was set up' });
    await expect(summary).toContainText('Admin account');
    await expect(summary).toContainText('hari · 2FA on');
    await expect(summary).toContainText('Storage');
    await expect(summary).toContainText('This computer');
    await expect(summary).not.toContainText('Remote access');
    await expect(page.getByRole('navigation', { name: 'Setup progress' })).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('summary after skipping two-factor says 2FA off', async ({ page, request }) => {
    await createAdminInUi(page, request);
    await skipTwoFactor(page);
    await finish(page);
    await expect(page.getByRole('group', { name: 'What was set up' })).toContainText('hari · 2FA off');
  });
});
