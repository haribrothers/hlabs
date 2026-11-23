// US-SYS-14 · Empty everyone's trash (main instance, admin): Trash shows its size; "Empty now" asks "Empty trash for
// everyone?", deletes it for good and says how much it freed; then it's disabled. Only this instance's own data.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

test("US-SYS-14 Empty now deletes everyone's trash after confirming", async ({ page, request }) => {
  const put = await request.post(`${MAIN_URL}/dev/trash-item`, {
    data: { name: `us-sys-14-${Date.now()}.bin`, bytes: 1_500_000 },
  });
  expect(put.ok()).toBe(true);
  await page.goto('/settings/storage');
  const clean = page.getByRole('group', { name: 'Clean up' });
  await expect(clean).toContainText('Emptied automatically after 30 days');
  await expect(clean).toContainText(/\d+(\.\d)? [KMGT]?B in the trash/);
  await clean.getByRole('button', { name: 'Empty now' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Empty trash for everyone?' });
  await expect(dialog).toContainText("is deleted for good. This can't be undone.");
  await dialog.getByRole('button', { name: 'Empty trash' }).click();
  await expect(page.getByText(/^Freed \d+(\.\d)? [KMGT]?B$/)).toBeVisible();
  await expect(clean.getByRole('button', { name: 'Empty now' })).toBeDisabled();
  await expect(clean).not.toContainText('in the trash');
});
