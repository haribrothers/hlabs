// US-APP-17 · Folder access, for real (serial): the Permissions tab's intro, "+ Give access to a folder" through the
// folder picker and a mode, saved with a restart; the folder is mounted at /mnt/hlabs/<name>.
import { expect, test } from '@playwright/test';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { ID, installAndOpen, savedToast, trpc, useSettingsDemo } from './app-settings';
import { STORAGE_ROOT, username } from './files';

useSettingsDemo();

test('US-APP-17 give the app a folder', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'serial', 'Installs an app');
  test.setTimeout(300_000);
  await installAndOpen(page, request, 'Permissions');
  // Made here through the picker: none left from an earlier run, and removed afterwards.
  const inbox = join(STORAGE_ROOT, 'users', await username(page), 'Demo inbox');
  rmSync(inbox, { recursive: true, force: true });
  try {
    await expect(
      page.getByText('Apps only see what you allow here. Changes take effect after a restart.'),
    ).toBeVisible();
    await expect(page.getByText("This app hasn't asked for USB, GPU or other device access.")).toBeVisible();
    await page.getByRole('button', { name: '+ Give access to a folder' }).click();
    const picker = page.getByRole('dialog', { name: /Choose a folder for Settings demo/ });
    await picker.getByRole('button', { name: '+ New folder' }).click();
    const naming = page.getByRole('dialog', { name: /New folder/ });
    await naming.getByRole('textbox').fill('Demo inbox');
    await naming.getByRole('button', { name: /Create|Make/ }).click();
    await picker.getByRole('button', { name: /^Use / }).click();
    const mode = page.getByRole('dialog', { name: 'Folder access' });
    await mode.getByRole('radio', { name: 'Read only' }).click();
    await mode.getByRole('button', { name: 'Give access' }).click();
    await expect(page.getByRole('group', { name: 'Folders' }).getByText('Home › Demo inbox')).toBeVisible();
    await page.getByRole('button', { name: 'Save and restart app' }).click();
    await expect(savedToast(page)).toBeVisible({ timeout: 120_000 });
    const config = (await trpc(page, 'apps.getConfig', { appId: ID })).result?.data as {
      folders: Array<{ target: string; mode: string }>;
    };
    expect(config.folders).toContainEqual(expect.objectContaining({ target: '/mnt/hlabs/Demo inbox', mode: 'ro' }));
  } finally {
    rmSync(inbox, { recursive: true, force: true });
  }
});
