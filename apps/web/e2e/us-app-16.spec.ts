// US-APP-16 · Save configuration and restart, for real (serial): Save waits for a change, Cancel puts it back, leaving
// with changes asks "Discard changes?", and saving restarts the app ("Saved. <App> restarted.").
import { expect, test } from '@playwright/test';
import { appState, installAndOpen, savedToast, useSettingsDemo } from './app-settings';

useSettingsDemo();

test('US-APP-16 save and restart, cancel and discard', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'serial', 'Installs an app');
  test.setTimeout(300_000);
  await installAndOpen(page, request, 'Configuration');
  const save = page.getByRole('button', { name: 'Save and restart app' });
  await expect(save).toBeDisabled();
  const workers = page.getByRole('textbox', { name: 'Value of WORKERS' });
  await workers.fill('3');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(workers).toHaveValue('2');

  await workers.fill('3');
  await page.getByRole('tablist', { name: 'App sections' }).getByRole('tab', { name: 'Permissions' }).click();
  const dialog = page.getByRole('dialog', { name: 'Discard changes?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(workers).toHaveValue('3');

  await save.click();
  await expect(savedToast(page)).toBeVisible({ timeout: 120_000 });
  expect((await appState(page))?.state).toBe('running');
});
