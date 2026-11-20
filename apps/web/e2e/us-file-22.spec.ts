// Phase 5 "Done when" (D-135): files can be renamed, moved to another folder and moved to Trash, and Undo and Trash's
// Restore bring them back. US-FILE-23 (F2 rename), US-FILE-22 (Move to… and its Undo), US-FILE-16 (Delete and its
// Undo) and US-FILE-17 (Restore from the Trash page), on the real daemon and disk.
import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homeFolder } from './files';

test('rename, move with Undo, Trash with Undo, and Restore from the Trash', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'the keyboard and right-click flows are desktop ones');
  const f = await homeFolder(page, `Organise ${info.project.name}`, {
    'Lease agreement.pdf': 'lease',
    'notes.txt': 'notes',
    'Taxes/keep.txt': 'x',
  });
  const onDisk = (rel: string) => existsSync(join(f.dir, rel));
  const item = (name: RegExp) => page.getByRole('button', { name });
  try {
    await page.goto(`/files?path=${encodeURIComponent(f.path)}`);

    // Rename with F2: the extension stays.
    await item(/^Lease agreement\.pdf/).focus();
    await page.keyboard.press('F2');
    const rename = page.getByRole('dialog', { name: 'Rename' });
    await rename.getByRole('textbox', { name: 'New name' }).fill('Lease 2026');
    await rename.getByRole('button', { name: 'Rename' }).click();
    await expect(item(/^Lease 2026\.pdf/)).toBeVisible();
    expect(onDisk('Lease 2026.pdf')).toBe(true);

    // Move to Taxes, then Undo.
    await item(/^Lease 2026\.pdf/).click();
    await page
      .getByRole('toolbar', { name: /selected/ })
      .getByRole('button', { name: 'Move to…' })
      .click();
    const move = page.getByRole('dialog', { name: 'Move “Lease 2026.pdf” to…' });
    await move.getByRole('treeitem', { name: 'Taxes' }).click();
    await move.getByRole('button', { name: 'Move to Taxes' }).click();
    await expect(page.getByText('Moved “Lease 2026.pdf” to Taxes')).toBeVisible();
    await expect.poll(() => onDisk('Taxes/Lease 2026.pdf')).toBe(true);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => onDisk('Lease 2026.pdf')).toBe(true);
    await expect(item(/^Lease 2026\.pdf/)).toBeVisible();

    // Move to Trash with Delete, then Undo.
    await item(/^notes\.txt/).focus();
    await page.keyboard.press('Delete');
    await expect(page.getByText('“notes.txt” moved to Trash')).toBeVisible();
    expect(onDisk('notes.txt')).toBe(false);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => onDisk('notes.txt')).toBe(true);

    // Move to Trash again, and Restore it from the Trash page.
    await item(/^notes\.txt/).focus();
    await page.keyboard.press('Delete');
    await expect.poll(() => onDisk('notes.txt')).toBe(false);
    await page.getByRole('link', { name: 'Trash' }).click();
    await page.getByRole('button', { name: 'Restore notes.txt' }).first().click();
    await expect(page.getByText('“notes.txt” restored')).toBeVisible();
    await expect.poll(() => onDisk('notes.txt')).toBe(true);
  } finally {
    f.remove();
  }
});
