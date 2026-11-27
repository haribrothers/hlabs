// US-PHONE-25 · Files on the phone in the new design (main instance, admin; phone projects): the bar with "+" and
// "Select" over the large title, the search field, the chips, the breadcrumb and the folder as an inset list with •••;
// the actions sheet; selecting with the bar in the tab bar's place and Move to as a full-height sheet; Rename with the
// name selected up to its extension; Trash with its round Restore. What each does is unchanged (US-FILE-*).
import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homeFolder } from './files';
import { box, expectTouchTarget, phoneOnly, tabBar } from './phone';

test('US-PHONE-25 Files: the bar, the large title, search, chips, breadcrumb and an inset list with •••', async ({
  page,
}, info) => {
  phoneOnly(info);
  const name = `A files ${info.project.name}`;
  const f = await homeFolder(page, name, { 'Bills/a.txt': 'a', 'Lease agreement.pdf': '%PDF lease' });
  try {
    await page.goto(`/files?path=${encodeURIComponent(f.path)}`);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.locator('.hl-p-large')).toHaveText('Files');
    await expect(page.getByRole('button', { name: 'Add to this folder' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select', exact: true })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search files' })).toHaveAttribute(
      'placeholder',
      `Search in ${name}`,
    );
    await expect(page.getByRole('navigation', { name: 'Places' }).getByRole('link', { name: 'Home' })).toBeVisible();
    const list = page.getByRole('group', { name });
    await expect(list).toHaveCSS('border-top-left-radius', '12px');
    const bills = list.getByRole('button', { name: 'Bills, folder' });
    await expect(bills).toContainText('1 item');
    expect(Math.round((await box(bills)).height)).toBeGreaterThanOrEqual(60);
    await expectTouchTarget(list.getByRole('button', { name: 'More for Bills' }));
    await expectTouchTarget(list.getByRole('button', { name: 'More for Lease agreement.pdf' }));
    // A tap opens the folder; the breadcrumb goes back.
    await bills.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Bills' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  } finally {
    f.remove();
  }
});

test('US-PHONE-25 ••• opens the actions sheet; Rename selects the name up to its extension', async ({ page }, info) => {
  phoneOnly(info);
  const f = await homeFolder(page, `A actions ${info.project.name}`, { 'Lease agreement.pdf': '%PDF lease' });
  try {
    await page.goto(`/files?path=${encodeURIComponent(f.path)}`);
    await page.getByRole('button', { name: 'More for Lease agreement.pdf' }).click();
    const sheet = page.getByRole('dialog', { name: 'Lease agreement.pdf' });
    await expect(sheet.locator('.hl-sheet-handle')).toBeVisible();
    await expect(sheet.locator('.hl-p-action')).toContainText(['Open', 'Download']);
    await expect(sheet.getByRole('button', { name: 'Move to Trash' })).toBeVisible();
    await sheet.getByRole('button', { name: 'Rename…' }).click();
    const rename = page.getByRole('dialog', { name: 'Rename' });
    await expect(rename.locator('.hl-sheet-bar').getByRole('button', { name: 'Cancel' })).toBeVisible();
    const field = rename.getByRole('textbox', { name: 'New name' });
    await expect(field).toBeFocused();
    await expect
      .poll(() => field.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]))
      .toEqual([0, 'Lease agreement'.length]);
    await page.keyboard.type('Lease 2026');
    await rename.getByRole('button', { name: 'Rename' }).click();
    await expect(rename).toBeHidden();
    await expect(page.getByRole('button', { name: /^Lease 2026\.pdf, / })).toBeVisible();
    expect(existsSync(join(f.dir, 'Lease 2026.pdf'))).toBe(true);
  } finally {
    f.remove();
  }
});

test('US-PHONE-25 Select: the bar in the tab bar’s place, and Move to as a full-height sheet', async ({
  page,
}, info) => {
  phoneOnly(info);
  const f = await homeFolder(page, `A select ${info.project.name}`, {
    'Taxes/keep.txt': 'k',
    'a.txt': 'a',
    'b.txt': 'b',
  });
  try {
    await page.goto(`/files?path=${encodeURIComponent(f.path)}`);
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Select all' })).toBeVisible();
    await page.getByRole('button', { name: /^a\.txt, / }).click();
    await page.getByRole('button', { name: /^b\.txt, / }).click();
    await expect(page.locator('.hl-p-files-nav')).toContainText('2 selected');
    const bar = page.getByRole('toolbar', { name: '2 items selected' });
    await expect(tabBar(page)).toBeHidden();
    const b = await box(bar);
    expect(Math.round(b.y + b.height)).toBe(page.viewportSize()!.height);
    await bar.getByRole('button', { name: 'Move' }).click();
    const move = page.getByRole('dialog', { name: 'Move 2 items to…' });
    const m = await box(move);
    expect(Math.round(m.y + m.height)).toBeGreaterThanOrEqual(page.viewportSize()!.height - 1);
    await move.getByRole('treeitem', { name: /^Taxes/ }).click();
    await move.getByRole('button', { name: 'Move to Taxes' }).click();
    await expect(move).toBeHidden();
    await expect.poll(() => existsSync(join(f.dir, 'Taxes', 'a.txt'))).toBe(true);
    await expect(tabBar(page)).toBeVisible();
  } finally {
    f.remove();
  }
});

test('US-PHONE-25 Trash: Restore all and Empty trash beside the title, and a round Restore on each row', async ({
  page,
}, info) => {
  phoneOnly(info);
  const file = `trashed ${info.project.name} ${Date.now()}.txt`;
  const f = await homeFolder(page, `A trash ${info.project.name}`, { [file]: 'x' });
  try {
    await page.goto(`/files?path=${encodeURIComponent(f.path)}`);
    await page.getByRole('button', { name: `More for ${file}` }).click();
    await page.getByRole('dialog', { name: file }).getByRole('button', { name: 'Move to Trash' }).click();
    await expect(page.getByRole('button', { name: new RegExp(`^${file.replace(/\./g, '\\.')}, `) })).toBeHidden();
    await page.getByRole('navigation', { name: 'Places' }).getByRole('link', { name: 'Trash' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Trash' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restore all' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Empty trash' })).toBeVisible();
    const restore = page.getByRole('button', { name: `Restore ${file}` }).first();
    await expectTouchTarget(restore);
    await restore.click();
    await expect.poll(() => existsSync(join(f.dir, file))).toBe(true);
  } finally {
    f.remove();
  }
});
