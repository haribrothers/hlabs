// US-SYS-37 · Confirm a factory reset (first-run instance): "Reset…" says what is deleted and what isn't, and "Reset
// hlabs" waits for the password and the hostname typed exactly; a wrong password says so and nothing is reset.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-SYS-37 the confirmation lists what goes and needs the password and the hostname', async ({
  page,
  request,
}) => {
  await finishOnboarding(page, request);
  await page.goto('/settings/advanced');
  const danger = page.getByRole('group', { name: 'Danger zone' });
  await expect(danger).toContainText('Deletes all apps, users and settings');
  await danger.getByRole('button', { name: 'Reset…' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Reset hlabs to factory settings?' });
  await expect(dialog).toContainText('All user accounts and settings are removed');
  await expect(dialog.getByRole('checkbox', { name: "Keep everyone's Home folders" })).not.toBeChecked();
  const go = dialog.getByRole('button', { name: 'Reset hlabs' });
  await expect(go).toBeDisabled();
  await dialog.getByLabel('Your password').fill('not the password');
  await dialog.getByLabel('Type hlabs to confirm').fill('Hlabs');
  await expect(go).toBeDisabled();
  await dialog.getByLabel('Type hlabs to confirm').fill('hlabs');
  await expect(go).toBeEnabled();
  expect((await new AxeBuilder({ page }).include('[role="alertdialog"]').analyze()).violations).toEqual([]);
  await go.click();
  await expect(dialog.getByText("That password isn't right")).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  // Nothing happened: still signed in, on the same page.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Advanced' })).toBeVisible();
});
