// US-PHONE-26 · Backups on the phone in the new design (main instance, admin; PhoneRedesignA_Backups, _BackupsEmpty,
// _BackupAdd): "‹ Settings" over the "Backups" title, the card (the last backup and "Back up now", or "No backups yet"),
// the rows with Restore…, and adding a destination as a sheet with Cancel in its bar. Read only: the backup specs that
// add destinations run in the serial project, so this one only looks and cancels.
import { expect, test } from '@playwright/test';
import { box, expectTouchTarget, phoneOnly } from './phone';

test('US-PHONE-26 Backups: the title under "‹ Settings", the card, the rows and Restore…', async ({ page }, info) => {
  phoneOnly(info);
  await page.goto('/settings/backups');
  const title = page.getByRole('heading', { level: 1, name: 'Backups' });
  await expect(title).toHaveClass(/hl-p-large/);
  await expect(page.locator('.hl-p-nav').getByRole('button', { name: 'Settings' })).toBeVisible();
  // Either the last backup's card or, with no destination, "No backups yet": both are inset boxes under the title.
  const card = page.locator('.hl-p-card').first();
  await expect(card).toBeVisible();
  expect((await box(card)).y).toBeGreaterThan((await box(title)).y);
  const empty = (await page.getByRole('region', { name: 'No backups yet' }).count()) > 0;
  const restore = page.getByRole('button', { name: 'Restore…' });
  await expect(restore).toHaveClass(/hl-p-row/);
  await expectTouchTarget(restore);
  if (empty) {
    await expect(restore).toBeDisabled();
    await expect(page.getByText('Restore turns on after your first backup.')).toBeVisible();
  } else {
    await expect(card.getByRole('button', { name: /^(Back up now|Backing up… \d+%)$/ })).toHaveClass(/hl-p-primary/);
  }
  // The card and the rows span the page between its gutters.
  const viewport = page.viewportSize()!;
  const b = await box(card);
  expect(Math.round(b.x)).toBe(16);
  expect(Math.round(b.x + b.width)).toBe(viewport.width - 16);
});

test('US-PHONE-26 adding a destination is a sheet: Cancel in its bar, the choices as rows, the buttons at the bottom', async ({
  page,
}, info) => {
  phoneOnly(info);
  await page.goto('/settings/backups');
  await page
    .getByRole('button', { name: /^Add a destination/ })
    .first()
    .click();
  const sheet = page.getByRole('dialog', { name: 'Add a backup destination' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.hl-sheet-handle')).toBeVisible();
  const cancel = sheet.locator('.hl-sheet-bar').getByRole('button', { name: 'Cancel' });
  await expect(cancel).toBeVisible();
  const network = sheet
    .getByRole('radiogroup', { name: 'Destination type' })
    .getByRole('radio', { name: /Network drive/ });
  await network.click();
  await expect(network).toHaveAttribute('aria-checked', 'true');
  await expectTouchTarget(network);
  const add = sheet.locator('.hl-sheet-actions').getByRole('button', { name: 'Add destination' });
  await expect(add).toBeVisible();
  // At the bottom of the sheet, the whole width.
  const s = await box(sheet);
  const a = await box(add);
  expect(a.y + a.height).toBeGreaterThan(s.y + s.height - 120);
  await cancel.click();
  await expect(sheet).toBeHidden();
});
