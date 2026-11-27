// Users rows in specs (US-ACCT-13…): a List row with its buttons on a computer; on a phone an inset row whose •••
// opens the person's (or invite's) sheet with the same actions (US-PHONE-28).
import type { Locator, Page, TestInfo } from '@playwright/test';

const onPhone = (info: TestInfo) => info.project.name.includes('phone');

/** A person's or a pending invite's row in Users, by text in it. */
export const peopleRow = (scope: Page | Locator, hasText: string | RegExp) =>
  scope.locator('.hl-list-row, .hl-p-row', { hasText });

/**
 * Presses one of a row's actions: Apps access, Reset password, Copy link, Revoke (a button in the row on a computer);
 * Make admin, Disable, Delete… (in its More options menu). On a phone each is in the row's ••• sheet.
 */
export async function peopleAction(page: Page, info: TestInfo, row: Locator, action: string, inMenu = false) {
  if (onPhone(info)) {
    await row.getByRole('button', { name: /^More options for / }).click();
    await page.getByRole('dialog').getByRole('button', { name: action }).click();
    return;
  }
  if (inMenu) {
    await row.getByRole('button', { name: /^More options for / }).click();
    await page.getByRole('menuitem', { name: action }).click();
    return;
  }
  await row.getByRole('button', { name: action }).click();
}
