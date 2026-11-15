// US-FILE-10 · Handle name conflicts when uploading (main instance, admin): a taken name asks; Keep both saves
// "<name> (2).<ext>".
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homeFolder } from './files';

test('US-FILE-10 a taken name asks, and Keep both saves "<name> (2).<ext>"', async ({ page }, info) => {
  const name = `Conflict ${info.project.name}`;
  const f = await homeFolder(page, name, { 'Report.pdf': 'old' });
  try {
    await page.goto(`/files?path=${encodeURIComponent(f.path)}`);
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload' }).click();
    await (await chooser).setFiles([{ name: 'Report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('new') }]);
    const dialog = page.getByRole('dialog', { name: `“Report.pdf” already exists in ${name}` });
    await dialog.getByRole('button', { name: 'Keep both' }).click();
    await expect(page.getByRole('button', { name: /^Report \(2\)\.pdf, / })).toBeVisible();
    expect(readFileSync(join(f.dir, 'Report.pdf'), 'utf8')).toBe('old');
    expect(readFileSync(join(f.dir, 'Report (2).pdf'), 'utf8')).toBe('new');
  } finally {
    f.remove();
  }
});
