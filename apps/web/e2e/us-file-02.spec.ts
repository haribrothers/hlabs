// US-FILE-02 · Browse a folder in grid view (main instance, admin): a folder opens from the grid, the breadcrumb and
// Back return, photos show a thumbnail and the footer counts the folder.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { homeFolder } from './files';

test('US-FILE-02 open folders from the grid, see thumbnails, and go back by breadcrumb and Back', async ({
  page,
}, info) => {
  const phone = info.project.name === 'phone';
  const name = `Grid ${info.project.name}`;
  const f = await homeFolder(page, name, {
    'Bills/March.pdf': 'pdf',
    'Kitchen plan.jpg': readFileSync('e2e/fixtures/photo.jpg'),
    '.hidden': 'x',
  });
  try {
    await page.goto(`/files?path=${encodeURIComponent(f.path)}`);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByText('2 items · 16 KB')).toBeVisible();
    // The thumbnail replaces the icon once it has loaded.
    const thumb = page.getByRole('button', { name: /^Kitchen plan\.jpg, / }).locator('img[src^="/api/files/preview/"]');
    await expect(thumb).toBeVisible();
    await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(256);
    const bills = page.getByRole('button', { name: 'Bills, folder' });
    if (phone) await bills.click();
    else await bills.dblclick();
    await expect(page.getByRole('heading', { level: 1, name: 'Bills' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^March\.pdf, / })).toBeVisible();
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'Bills' })).toBeVisible();
  } finally {
    f.remove();
  }
});
