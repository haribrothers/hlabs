// US-ACCT-16 · Delete someone (first-run instance: an admin deletes a signed-in member).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createMember, signedInAs } from './invites';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ACCT-16 delete a member: they leave Users and their browser is signed out', async ({
  page,
  request,
  browser,
}, info) => {
  await finishOnboarding(page, request);
  const member = await createMember(page, request, FIRST_RUN_URL, { name: 'Anu' });
  const anu = await signedInAs(browser, info.project.use, FIRST_RUN_URL, member);

  await page.goto('/settings/users');
  const row = page.locator('.hl-list-row', { hasText: 'Anu' });
  await row.getByRole('button', { name: 'More options for Anu' }).click();
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete Anu?' });
  await expect(dialog.getByRole('checkbox', { name: /Also delete their Home folder/ })).not.toBeChecked();
  if (process.env.HLABS_SHOTS)
    await page.screenshot({ path: `${process.env.HLABS_SHOTS}/delete-user-${info.project.name}.png` });
  expect((await new AxeBuilder({ page }).include('[role=alertdialog]').analyze()).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Delete Anu' }).click();
  await expect(page.getByText('Anu was deleted')).toBeVisible();
  await expect(row).toHaveCount(0);
  await expect(anu).toHaveURL(/\/login/);
});
