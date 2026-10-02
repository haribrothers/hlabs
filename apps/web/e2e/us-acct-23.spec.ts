// US-ACCT-23 · Preview the invite page (main instance, signed in as an admin).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-ACCT-23 the preview opens in a new tab, disabled, and the invite still works afterwards', async ({
  page,
  context,
}, info) => {
  await page.goto('/settings/users');
  await page.getByRole('button', { name: 'Invite someone' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invite someone' });
  await expect(dialog.getByRole('textbox', { name: 'Invite link' })).toHaveValue(/\/invite\//);
  if (process.env.HLABS_SHOTS)
    await page.screenshot({ path: `${process.env.HLABS_SHOTS}/invite-preview-link-${info.project.name}.png` });
  const [preview] = await Promise.all([
    context.waitForEvent('page'),
    dialog.getByRole('link', { name: /Preview what they see/ }).click(),
  ]);
  await expect(preview).toHaveURL(/\/invite\/[A-Za-z0-9_-]{43}\?preview=1$/);
  await expect(preview.getByRole('status')).toHaveText("Preview. This won't use up the invite.");
  await expect(preview.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await expect(preview.getByLabel('Username')).toBeDisabled();
  await expect(preview.getByRole('button', { name: 'Join hlabs' })).toBeDisabled();
  expect((await new AxeBuilder({ page: preview }).analyze()).violations).toEqual([]);

  // Back in the dialog: the same link is still valid for the real invitee.
  const token = new URL(await dialog.getByRole('textbox', { name: 'Invite link' }).inputValue()).pathname.split(
    '/',
  )[2]!;
  const status = await page.evaluate(async (t) => {
    const res = await fetch(`/trpc/invites.inspect?input=${encodeURIComponent(JSON.stringify({ token: t }))}`);
    return ((await res.json()) as { result: { data: { status: string } } }).result.data.status;
  }, token);
  expect(status).toBe('valid');
  await dialog.getByRole('button', { name: 'Close' }).click();
});
