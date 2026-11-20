// US-BKP-08…11 with the real restic (main instance, admin, the pretend NAS): add the NAS's Backups share as a
// destination (Test connection, the six-word password), back up now, see the run, then remove the destination. Runs in
// the serial project: it changes the instance's backups and the pretend NAS.
import { expect, test } from '@playwright/test';
import { addNasDestination, cleanBackups } from './backups';

test('US-BKP-08 a network drive as a destination: test, add, back up now, remove', async ({ page, request }) => {
  test.setTimeout(8 * 60_000);
  await cleanBackups(page, request);
  try {
    await expect(page.getByRole('region', { name: 'No backups yet' })).toBeVisible();
    const dialog = await addNasDestination(page);
    await expect(dialog.getByRole('textbox', { name: 'Encryption password' })).toHaveValue(/^[a-z]+(-[a-z]+){5}$/);
    await dialog.getByRole('button', { name: 'Test connection' }).click();
    await expect(dialog.getByText('Connected')).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Add destination' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect(page.getByRole('status').getByText('Destination added')).toBeVisible();
    const destinations = page.getByRole('group', { name: 'Destinations' });
    await expect(destinations).toContainText('NAS · nas.local/Backups');
    await expect(destinations).toContainText('Healthy');

    await page.getByRole('button', { name: 'Back up now' }).click();
    await expect(page.getByRole('status').getByText('Backup started')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Backing up… \d+%$/ })).toBeDisabled();
    // Done when Back up now is back (the instance has many Home folders to copy).
    await expect(page.getByRole('button', { name: 'Back up now' })).toBeEnabled({ timeout: 5 * 60_000 });
    await expect(page.getByRole('region', { name: 'Last backup just now' })).toBeVisible();
    const runs = page.getByRole('group', { name: 'Recent runs' });
    await expect(runs).toContainText('Succeeded');
    // Counted once the run has tidied up.
    await expect(destinations).toContainText(/1 restore point/, { timeout: 60_000 });

    await page.getByRole('button', { name: 'Edit NAS' }).click();
    await page.getByRole('button', { name: 'Remove destination' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Stop backing up to NAS?' });
    await confirm.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByRole('region', { name: 'No backups yet' })).toBeVisible();
  } finally {
    await cleanBackups(page, request);
  }
});
