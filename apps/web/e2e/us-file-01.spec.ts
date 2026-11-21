// US-FILE-01 · See my places in the sidebar (main instance, admin): Files opens Home with its first folders, the
// sidebar (chips on a phone) moves between places, and This computer lists every Home and Shared.
import { expect, test } from '@playwright/test';

test('US-FILE-01 Files opens Home with Photos, Documents and Downloads, and the places move between folders', async ({
  page,
}, info) => {
  const phone = info.project.name === 'phone';
  await page.goto('/files');
  const places = page.getByRole('navigation', { name: 'Places' });
  await expect(places.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  for (const name of ['Documents', 'Downloads', 'Photos']) {
    await expect(page.getByRole('button', { name: new RegExp(`^${name}, folder$`) })).toBeVisible();
  }
  if (!phone) {
    await expect(page.getByText(/ of .* used$/)).toBeVisible();
    await expect(places.getByRole('heading', { name: 'Locations' })).toBeVisible();
  }
  await places.getByRole('link', { name: 'Photos' }).click();
  await expect(page).toHaveURL(/\/files\?path=%2Fhome%2FPhotos$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Photos' })).toBeVisible();
  await places.getByRole('link', { name: 'This computer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'This computer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Shared, folder' })).toBeVisible();
  // Back goes to the folder before.
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Photos' })).toBeVisible();
});
