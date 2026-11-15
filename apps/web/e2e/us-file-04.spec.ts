// US-FILE-04 · Search files (main instance, admin): a search finds names in the folder and below, with the folder
// each is in; no matches says so; Escape returns to the folder.
import { expect, test } from '@playwright/test';
import { homeFolder } from './files';

test('US-FILE-04 search finds files below the open folder and shows where they are', async ({ page }, info) => {
  const name = `Search ${info.project.name}`;
  const f = await homeFolder(page, name, {
    'Bills/Electricity bill March.pdf': 'x',
    'Taxes/2026/Bill of sale.txt': 'x',
    'Lease.pdf': 'x',
  });
  try {
    await page.goto(`/files?path=${encodeURIComponent(f.path)}`);
    const field = page.getByRole('searchbox', { name: 'Search files' });
    await field.fill('BILL');
    const sale = page.getByRole('button', { name: /^Bill of sale\.txt, / });
    await expect(sale).toBeVisible();
    await expect(sale).toContainText(`Home › ${name} › Taxes › 2026`);
    await expect(page.getByRole('button', { name: /^Electricity bill March\.pdf, / })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Lease\.pdf/ })).toBeHidden();
    await field.fill('zebra');
    await expect(page.getByText('No files match “zebra”')).toBeVisible();
    await field.press('Escape');
    await expect(page.getByRole('button', { name: /^Lease\.pdf, / })).toBeVisible();
    // Escape in the field didn't close Files.
    await expect(page).toHaveURL(/\/files\?/);
  } finally {
    f.remove();
  }
});
