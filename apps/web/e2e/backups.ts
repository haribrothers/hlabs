// Backup specs (08-usage-backups) on the main instance: the pretend NAS (HLABS_DEV_FAKE_NAS) holds the repository in
// its Backups share; specs start and end with no destinations and no repository there.
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MAIN_URL } from './instances';

export const DATA_DIR = resolve(process.env.HLABS_E2E_DATA_DIR ?? '../../.e2e-data');
export const ADMIN_PASSWORD = 'correct horse battery';

/** No destinations, no repository on the NAS, the NAS online and forgotten. */
export async function cleanBackups(page: Page, request: APIRequestContext) {
  await page.goto('/settings/backups');
  await expect(page.getByRole('heading', { level: 1, name: 'Backups' })).toBeVisible();
  // Destinations load with the page.
  await page.waitForLoadState('networkidle');
  while (await page.getByRole('button', { name: /^Edit / }).count()) {
    await page
      .getByRole('button', { name: /^Edit / })
      .first()
      .click();
    await page.getByRole('button', { name: 'Remove destination' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
  }
  rmSync(join(DATA_DIR, 'fake-nas', 'Backups', 'hlabs-backups'), { recursive: true, force: true });
  await request.post(`${MAIN_URL}/dev/fake-nas`, { data: { online: true, forget: true } });
}

/** Adds the NAS's Backups share as a destination through the dialog. */
export async function addNasDestination(page: Page) {
  await page.getByRole('button', { name: '+ Add a destination' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add a backup destination' });
  await dialog.getByRole('radio', { name: /Network drive/ }).click();
  await dialog.getByRole('textbox', { name: 'Or enter a share address' }).fill('smb://nas.local/Backups');
  await dialog.getByRole('textbox', { name: 'Username' }).fill('hari');
  await dialog.getByLabel('Password', { exact: true }).fill('nas-password');
  return dialog;
}
