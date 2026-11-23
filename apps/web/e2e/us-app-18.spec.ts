// US-APP-18 · Network access, for real (serial): "Reach the internet" off and saved restarts the app on an internal
// network behind the forwarding sidecar (D-049, D-165); it's still running and served, and its network is internal.
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { appState, installAndOpen, savedToast, useSettingsDemo } from './app-settings';

useSettingsDemo();

test('US-APP-18 cut the app off from the internet', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'serial', 'Installs an app');
  test.setTimeout(300_000);
  await installAndOpen(page, request, 'Permissions');
  const network = page.getByRole('group', { name: 'Network' });
  await expect(network.getByText('Needed for website icons')).toBeVisible();
  await expect(network.getByText('Off keeps this app isolated from the rest')).toBeVisible();
  await network.getByRole('switch', { name: 'Reach the internet' }).click();
  await page.getByRole('button', { name: 'Save and restart app' }).click();
  await expect(savedToast(page)).toBeVisible({ timeout: 180_000 });
  // Healthy through the sidecar: the health check reaches it on its loopback port.
  expect((await appState(page))?.state).toBe('running');
  const internal = execFileSync('docker', [
    'network',
    'inspect',
    '--format',
    '{{.Internal}}',
    'hlabs-e2e-settings-demo_default',
  ])
    .toString()
    .trim();
  expect(internal).toBe('true');
});
