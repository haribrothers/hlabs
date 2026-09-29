// US-STATE-13 · The riskiest confirmations ask for the password and a typed name. Phase 1 has no such action yet
// (restore and factory reset come later), so this drives the dev gallery's factory-reset demo in a real browser:
// paste, keyboard, focus and a wrong password.
import { expect, test } from '@playwright/test';

test('US-STATE-13 password and typed name: pasteable, exact, and a wrong password is cleared and focused', async ({
  page,
  context,
  browserName,
}) => {
  await page.goto('/dev/ui');
  await page.getByRole('button', { name: 'Factory reset…' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Reset hlabs to factory settings?' });
  const password = dialog.getByLabel('Your password');
  const typed = dialog.getByLabel('Type hlabs to confirm');
  const go = dialog.getByRole('button', { name: 'Reset hlabs' });

  await expect(password).toBeFocused();
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  await expect(go).toBeDisabled();
  await password.fill('wrong');
  await expect(go).toBeDisabled();

  // Paste works in the name field.
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => navigator.clipboard.writeText('HLABS'));
  await typed.focus();
  await page.keyboard.press('ControlOrMeta+V');
  await expect(typed).toHaveValue('HLABS');
  await expect(go).toBeDisabled();
  await typed.fill('hlabs ');
  await expect(go).toBeEnabled();

  await typed.press('Enter');
  await expect(password).toHaveValue('');
  await expect(password).toBeFocused();
  await expect(dialog.getByText("That password isn't right.")).toBeVisible();
  await expect(go).toBeDisabled();

  await password.fill('correct horse battery');
  await go.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('confirm-result')).toHaveText('Reset confirmed');
});
