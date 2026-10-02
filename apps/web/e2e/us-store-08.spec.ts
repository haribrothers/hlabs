// US-STORE-08 · Choose folder access in the install sheet (main instance, admin, built-in store). Nothing is installed:
// the sheet is closed with Cancel. Changing a folder's place needs the folder picker from Files (phase 5, D-036).
import { expect, test } from '@playwright/test';

test('US-STORE-08 Install on the details opens the sheet with each folder, where it goes and its mode', async ({
  page,
}, info) => {
  await page.goto('/store/app/immich');
  await page.getByRole('button', { name: 'Install', exact: true }).click();
  await expect(page).toHaveURL(/\/store\/app\/immich\?install=true$/);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Install Immich')).toBeVisible();
  await expect(sheet.getByText('Review what it can access')).toBeVisible();
  await expect(sheet.getByText('Home › Photos')).toBeVisible();
  await expect(sheet.getByText('Read and write · where your photos and videos are stored')).toBeVisible();
  // Required, so it can't be turned off.
  await expect(sheet.getByRole('switch', { name: 'Give access to Home › Photos' })).toBeDisabled();
  if (info.project.name === 'phone') {
    // A bottom sheet on a phone: it reaches the bottom of the screen.
    const box = (await sheet.boundingBox())!;
    expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(page.viewportSize()!.height - 1);
  }
});
