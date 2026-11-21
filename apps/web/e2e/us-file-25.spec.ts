// US-FILE-25 · Choose a folder for an app (main instance, admin, built-in store): "Change" on Immich's Photo library
// opens the FolderPicker at Home › Photos; back up to Home, a folder of this spec's own is opened and one in it chosen,
// and the row shows it. Nothing is installed: the sheet is closed with Cancel.
import { expect, test } from '@playwright/test';
import { homeFolder } from './files';

test('US-FILE-25 Change opens the picker; a folder chosen there is the one the app gets', async ({ page }, info) => {
  const mine = `Picker ${info.project.name}`;
  const folder = await homeFolder(page, mine, {
    'Holidays 2025/a.jpg': 'x',
    'Camera roll/b.jpg': 'x',
    'note.txt': 'x',
  });
  try {
    await page.goto('/store/app/immich');
    await page.getByRole('button', { name: 'Install', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: /Install Immich/ });
    await sheet.getByRole('button', { name: 'Change folder for Photo library' }).click();

    const picker = page.getByRole('dialog', { name: /Choose a folder for Immich/ });
    await expect(picker.getByText('Photo library · Read and write')).toBeVisible();
    await expect(
      picker.getByRole('navigation', { name: 'Places' }).getByRole('button', { name: 'Home' }),
    ).toHaveAttribute('aria-current', 'location');
    const crumbs = picker.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.locator('[aria-current="location"]')).toHaveText('Photos');
    await crumbs.getByRole('button', { name: 'Home', exact: true }).click();
    const folders = picker.getByRole('listbox');
    const mineRow = folders.getByRole('option', { name: mine });
    await expect(mineRow).toBeVisible();

    if (info.project.name === 'phone') {
      // A full-height sheet; a tap opens a folder, and "Use" takes the open one.
      const box = (await picker.boundingBox())!;
      expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(page.viewportSize()!.height - 1);
      await mineRow.click();
      await folders.getByRole('option', { name: 'Holidays 2025' }).click();
      await expect(picker.getByText('No folders in Holidays 2025')).toBeVisible();
    } else {
      // Double-click opens; only folders are listed; a click selects.
      await mineRow.dblclick();
      await expect(folders.getByRole('option')).toHaveText(['Camera roll', 'Holidays 2025']);
      await folders.getByRole('option', { name: 'Holidays 2025' }).click();
    }
    await picker.getByRole('button', { name: 'Use Holidays 2025' }).click();
    await expect(picker).toBeHidden();
    await expect(sheet.getByText(`Home › ${mine} › Holidays 2025`)).toBeVisible();
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    await expect(sheet).toBeHidden();
  } finally {
    folder.remove();
  }
});

test('US-FILE-25 Escape closes the picker and leaves the folder as it was', async ({ page }) => {
  await page.goto('/store/app/immich');
  await page.getByRole('button', { name: 'Install', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: /Install Immich/ });
  await sheet.getByRole('button', { name: 'Change folder for Photo library' }).click();
  const picker = page.getByRole('dialog', { name: /Choose a folder for Immich/ });
  await expect(picker.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  await expect(sheet.getByText('Home › Photos')).toBeVisible();

  // Escape the moment the picker opens closes the picker only: for an instant the sheet below still holds Radix's
  // Escape listener (it failed this way on CI).
  await sheet.getByRole('button', { name: 'Change folder for Photo library' }).evaluate((b: HTMLElement) => {
    b.click();
    setTimeout(() =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      ),
    );
  });
  await expect(picker).toBeHidden();
  await expect(sheet.getByText('Home › Photos')).toBeVisible();
});
