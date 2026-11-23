// US-FILE-08 · Upload files with progress (main instance, admin): Upload picks files; they upload one at a time, the
// panel shows them, the folder lists them, and "<n> files uploaded" follows.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { folderAction, homeFolder } from './files';

test('US-FILE-08 upload picked files into the open folder', async ({ page }, info) => {
  const f = await homeFolder(page, `Upload ${info.project.name}`);
  try {
    await page.goto(`/files?path=${encodeURIComponent(f.path)}`);
    const chooser = page.waitForEvent('filechooser');
    await (await folderAction(page, info.project.name === 'phone', 'Upload')).click();
    await (
      await chooser
    ).setFiles([
      { name: 'Tax return 2025.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF tax') },
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
    ]);
    const panel = page.getByRole('region', { name: 'Uploads' });
    await expect(panel.getByRole('heading', { name: '2 files uploaded' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Tax return 2025\.pdf, / })).toBeVisible();
    await expect(page.getByRole('button', { name: /^notes\.txt, / })).toBeVisible();
    expect(readFileSync(join(f.dir, 'notes.txt'), 'utf8')).toBe('hello');
    // After 5 s the panel goes and a toast says how many.
    await expect(page.getByText('2 files uploaded').last()).toBeVisible();
    await expect(panel).toBeHidden({ timeout: 10_000 });
  } finally {
    f.remove();
  }
});
