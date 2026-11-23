// US-APP-13 · Edit environment variables, for real (serial): the manifest's settings with their controls, a variable
// added and saved, a bad name refused inline; still there after a reload.
import { expect, test } from '@playwright/test';
import { ID, installAndOpen, savedToast, useSettingsDemo } from './app-settings';

useSettingsDemo();

test('US-APP-13 edit, add and check variables', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'serial', 'Installs an app');
  test.setTimeout(300_000);
  await installAndOpen(page, request, 'Configuration');
  const env = page.getByRole('group', { name: 'Environment variables' });
  await expect(env.getByRole('textbox', { name: 'Name of WORKERS' })).toHaveAttribute('readonly', '');
  await expect(env.getByRole('button', { name: 'Remove WORKERS' })).toBeDisabled();
  await expect(page.getByText("Values from the app's manifest are pre-filled")).toBeVisible();

  await env.getByRole('textbox', { name: 'Value of WORKERS' }).fill('many');
  await expect(page.getByText('Enter a number')).toBeVisible();
  await env.getByRole('textbox', { name: 'Value of WORKERS' }).fill('4');

  await page.getByRole('button', { name: '+ Add variable' }).click();
  const name = page.getByRole('textbox', { name: 'Name of the new variable' });
  await expect(name).toBeFocused();
  await name.fill('TZ');
  await expect(page.getByText('hlabs sets this one itself. Choose another name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save and restart app' })).toBeDisabled();
  // The row is named after what's typed in it.
  await page.getByRole('textbox', { name: 'Name of TZ' }).fill('GREETING');
  await page.getByRole('textbox', { name: 'Value of GREETING' }).fill('hello');
  await page.getByRole('button', { name: 'Save and restart app' }).click();
  await expect(savedToast(page)).toBeVisible({ timeout: 120_000 });

  await page.reload();
  await page.getByRole('tablist', { name: 'App sections' }).getByRole('tab', { name: 'Configuration' }).click();
  await expect(page.getByRole('textbox', { name: 'Value of GREETING' })).toHaveValue('hello');
  await expect(page.getByRole('textbox', { name: 'Value of WORKERS' })).toHaveValue('4');
  expect(ID).toBe('settings-demo');
});
