// US-ONB-14 · Keep data on this computer (first-run instance). Continue goes on to the starter apps (phase 2).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createAdminInUi, skipTwoFactor } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ONB-14 keep data on this computer, finish setup, and a reload goes home', async ({ page, request }) => {
  await createAdminInUi(page, request);
  await skipTwoFactor(page);

  await expect(page.getByRole('navigation', { name: 'Setup progress' })).toContainText('Step 4 of 5');
  await expect(page.getByRole('heading', { level: 1, name: 'Where should your data live?' })).toBeFocused();
  const local = page.getByRole('radio', { name: /This computer/ });
  await expect(local).toHaveAttribute('aria-checked', 'true');
  await expect(local).toContainText(/ · \d+(\.\d)? [KMGT]?B free/);
  await expect(local).toContainText('Fastest');
  await expect(
    page.getByText('App databases always stay on this computer for speed. Media libraries can point anywhere.'),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // A radio group from the keyboard: arrows move and select.
  await local.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: /External drive/ })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(local).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/apps`);
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/done`);
  await expect(page.getByRole('heading', { level: 1, name: "You're all set" })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/`);
});
