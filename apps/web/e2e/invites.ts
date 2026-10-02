// Invites made through the real InviteDialog, for the people stories (US-ACCT-21…, US-AUTH-23/24).
import { expect, type Page } from '@playwright/test';

/** Opens Users › Invite someone, applies the choices, presses Done, and returns the link. */
export async function createInvite(
  page: Page,
  opts: { name?: string; role?: 'Member' | 'Admin'; apps?: string[] } = {},
): Promise<string> {
  await page.goto('/settings/users');
  await page.getByRole('button', { name: 'Invite someone' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invite someone' });
  const link = dialog.getByRole('textbox', { name: 'Invite link' });
  await expect(link).toHaveValue(/\/invite\//);
  if (opts.role === 'Admin') await dialog.getByRole('radio', { name: /Admin/ }).click();
  for (const app of opts.apps ?? []) await dialog.getByRole('switch', { name: app }).click();
  if (opts.name) await dialog.getByLabel('Their name (optional)').fill(opts.name);
  const url = await link.inputValue();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  // The link names hlabs.local; open it on the instance under test.
  return new URL(url).pathname;
}
