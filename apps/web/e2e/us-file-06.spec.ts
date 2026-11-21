// US-FILE-06 · Preview a file (main instance, admin): a photo shows over the window with its details, Next moves to
// the next file (text in monospace), Escape closes and focus returns to the file.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { homeFolder } from './files';

test('US-FILE-06 preview a photo and a text file, move between them, and close back to the file', async ({
  page,
}, info) => {
  const phone = info.project.name === 'phone';
  const f = await homeFolder(page, `Preview ${info.project.name}`, {
    'Kitchen plan.jpg': readFileSync('e2e/fixtures/photo.jpg'),
    'notes.md': '# Shopping\n\n- milk\n',
  });
  try {
    await page.goto(`/files?path=${encodeURIComponent(f.path)}`);
    const photo = page.getByRole('button', { name: /^Kitchen plan\.jpg, / });
    if (phone) await photo.click();
    else await photo.dblclick();
    const dialog = page.getByRole('dialog', { name: 'Preview of Kitchen plan.jpg' });
    const img = dialog.getByRole('img', { name: 'Kitchen plan.jpg' });
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1600);
    await expect(dialog.getByText('1600 × 1200')).toBeVisible();
    await dialog.getByRole('button', { name: 'Next file' }).click();
    await expect(page.getByRole('dialog', { name: 'Preview of notes.md' }).getByText('- milk')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    if (!phone) await expect(page.getByRole('button', { name: /^notes\.md, / })).toBeFocused();
  } finally {
    f.remove();
  }
});
