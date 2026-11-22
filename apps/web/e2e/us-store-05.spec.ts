// US-STORE-05 · Search results with filters (main instance, admin): the chips' counts, "Installed" narrowing the list,
// and a one-character query asking for nothing.
import { expect, test } from '@playwright/test';

test('US-STORE-05 the chips count the results; Installed keeps only installed apps', async ({ page }) => {
  await page.goto('/store/search?q=a');
  await expect(page.getByRole('list', { name: 'Results for “a”' })).toHaveCount(0);

  await page.goto('/store/search?q=photo');
  const list = page.getByRole('list', { name: 'Results for “photo”' });
  await expect(list).toBeVisible();
  const all = page.getByRole('button', { name: /^All · \d+$/ });
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  const total = Number((await all.textContent())!.split('· ')[1]);
  await expect(list.getByRole('listitem')).toHaveCount(total);
  if (process.env.HLABS_SHOTS)
    await page.screenshot({ path: `${process.env.HLABS_SHOTS}/store-search-${test.info().project.name}.png` });
  const installed = page.getByRole('button', { name: /^Installed · \d+$/ });
  const count = Number((await installed.textContent())!.split('· ')[1]);
  await installed.click();
  if (count) await expect(list.getByRole('listitem')).toHaveCount(count);
  else await expect(page.getByText('No apps match “photo”')).toBeVisible();
});
