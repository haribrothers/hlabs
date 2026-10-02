// US-ACCT-25 · Shared folder and live usage for a member (main instance, signed in as an admin).
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';
import { createMember } from './invites';

test('US-ACCT-25 the Shared folder switch saves with Apps access; live usage waits for the members policy', async ({
  page,
  request,
}, info) => {
  const name = `Options ${info.project.name} ${Date.now()}`;
  await createMember(page, request, MAIN_URL, { name });
  await page.goto('/settings/users');
  const row = page.locator('.hl-list-row', { hasText: name });
  await row.getByRole('button', { name: 'Apps access' }).click();
  let dialog = page.getByRole('dialog', { name: new RegExp(`What ${name} can open`) });
  await expect(dialog.getByText('Their own Home folder is always private')).toBeVisible();
  await dialog.getByRole('switch', { name: 'See the Shared folder in Files' }).click();
  // Live usage is off for all members by default (US-ACCT-20), so their own switch waits for that.
  await expect(dialog.getByRole('switch', { name: 'See live usage' })).toBeDisabled();
  await expect(dialog.getByText('Turned off for all members in Users')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  await row.getByRole('button', { name: 'Apps access' }).click();
  dialog = page.getByRole('dialog', { name: new RegExp(`What ${name} can open`) });
  await expect(dialog.getByRole('switch', { name: 'See the Shared folder in Files' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(dialog.getByRole('switch', { name: 'See live usage' })).toHaveAttribute('aria-checked', 'false');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});
