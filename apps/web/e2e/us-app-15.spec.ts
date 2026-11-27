// US-APP-15 · Change web address and port, for real (serial): a taken address is refused inline; a new address and
// port are saved, the toast shows the new address with Copy, and apps.get gives them.
import { expect, test } from '@playwright/test';
import { appState, installAndOpen, savedToast, useSettingsDemo } from './app-settings';

useSettingsDemo();

test('US-APP-15 move the app to a new address and port', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'serial', 'Installs an app');
  test.setTimeout(300_000);
  await installAndOpen(page, request, 'Configuration');
  const network = page.getByRole('group', { name: 'Network' });
  await expect(network.getByText('App listens on 80 inside its container')).toBeVisible();
  const subdomain = network.getByRole('textbox', { name: 'Subdomain' });
  await subdomain.fill('hlabs');
  await expect(page.getByText('hlabs uses this address. Choose another')).toBeVisible();
  await subdomain.fill('demo-settings');
  const port = network.getByRole('textbox', { name: 'Host port' });
  await port.fill('8080');
  await expect(page.getByText('Choose a port from 12000 to 12999')).toBeVisible();
  await port.fill('12987');
  await page.getByRole('button', { name: 'Save and restart app' }).click();
  const toast = savedToast(page);
  await expect(toast).toBeVisible({ timeout: 120_000 });
  await expect(toast).toContainText('demo-settings.');
  await expect(toast.getByRole('button', { name: 'Copy' })).toBeVisible();
  const app = await appState(page);
  expect(app).toMatchObject({ webPort: 12987, state: 'running' });
  expect(String(app?.address)).toMatch(/^demo-settings\./);
});
