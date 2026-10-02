// US-ACCT-21 · Create an invite link (main instance, signed in as an admin).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Pending invites' names, from inside the signed-in page (Playwright's request context skips the Secure cookie). */
const pendingNames = (page: Page) =>
  page.evaluate(async () => {
    const res = await fetch('/trpc/invites.list');
    const body = (await res.json()) as { result: { data: { invites: Array<{ displayName: string | null }> } } };
    return body.result.data.invites.map((i) => i.displayName);
  });

test('US-ACCT-21 copy the link and press Done: the invite is pending in Users', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop', 'clipboard permissions are Chromium desktop only here');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const name = `Guest ${info.workerIndex}-${Date.now()}`;
  await page.goto('/settings/users');
  await page.getByRole('button', { name: 'Invite someone' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invite someone' });
  const link = dialog.getByRole('textbox', { name: 'Invite link' });
  await expect(link).toHaveValue(/^https:\/\/hlabs\.local(:\d+)?\/invite\/[A-Za-z0-9_-]{43}$/);
  await dialog.getByLabel('Their name (optional)').fill(name);
  await dialog.getByRole('button', { name: 'Copy' }).click();
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await link.inputValue());
  if (process.env.HLABS_SHOTS) await page.screenshot({ path: `${process.env.HLABS_SHOTS}/invite-dialog.png` });
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Invite pending').first()).toBeVisible();
  expect(await pendingNames(page)).toContain(name);
});

test('US-ACCT-21 Close without copying revokes the invite', async ({ page }, info) => {
  const name = `Gone ${info.workerIndex}-${Date.now()}`;
  await page.goto('/settings/users');
  await page.getByRole('button', { name: 'Invite someone' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invite someone' });
  await expect(dialog.getByRole('textbox', { name: 'Invite link' })).toHaveValue(/\/invite\//);
  await dialog.getByLabel('Their name (optional)').fill(name);
  // Wait for the name to save, so the revoked invite would be recognisable if it stayed.
  await page.waitForResponse((r) => r.url().includes('invites.update'));
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => pendingNames(page)).not.toContain(name);
});
