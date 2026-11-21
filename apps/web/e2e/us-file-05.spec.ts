// US-FILE-05 · Download files (main instance, admin): Download in the preview saves the file under its own name.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { homeFolder } from './files';

test('US-FILE-05 Download in the preview downloads the file with its name', async ({ page }, info) => {
  const f = await homeFolder(page, `Download ${info.project.name}`, { 'Résumé 2026.pdf': '%PDF-1.7 hello' });
  try {
    await page.goto(`/files?path=${encodeURIComponent(f.path)}`);
    const item = page.getByRole('button', { name: /^Résumé 2026\.pdf, / });
    if (info.project.name === 'phone') await item.click();
    else await item.dblclick();
    const dialog = page.getByRole('dialog', { name: 'Preview of Résumé 2026.pdf' });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('link', { name: 'Download' }).first().click(),
    ]);
    expect(download.suggestedFilename()).toBe('Résumé 2026.pdf');
    expect(readFileSync(await download.path(), 'utf8')).toBe('%PDF-1.7 hello');
  } finally {
    f.remove();
  }
});
