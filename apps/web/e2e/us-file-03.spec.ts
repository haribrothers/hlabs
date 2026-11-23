// US-FILE-03 · Create a folder (main instance, admin): New folder makes it and focuses it; a taken name says so.
import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { folderAction, homeFolder } from './files';

test('US-FILE-03 New folder creates a folder and focuses it; a taken name is said inline', async ({ page }, info) => {
  const f = await homeFolder(page, `New folder ${info.project.name}`, { 'Bills/a.pdf': 'x' });
  try {
    await page.goto(`/files?path=${encodeURIComponent(f.path)}`);
    await (await folderAction(page, info.project.name === 'phone', 'New folder')).click();
    const dialog = page.getByRole('dialog', { name: 'New folder' });
    const name = dialog.getByRole('textbox', { name: 'Name' });
    await expect(name).toHaveValue('Untitled folder');
    // Selected: typing replaces it.
    await page.keyboard.type('Bills');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('A folder called “Bills” already exists here.');
    await name.fill('Taxes 2026');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Taxes 2026, folder' })).toBeFocused();
    expect(existsSync(join(f.dir, 'Taxes 2026'))).toBe(true);
  } finally {
    f.remove();
  }
});
