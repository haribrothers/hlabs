// US-SYS-03 · Disconnect remote access (first-run instance, pretend Tailscale).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-SYS-03 disconnect asks first, then remote access is off and Connect is back', async ({ page, request }) => {
  await finishOnboarding(page, request);
  await request.post(`${FIRST_RUN_URL}/dev/tailscale`, {
    data: { state: 'running', tailnet: 'tail9.ts.net', nodeName: 'hari-home' },
  });
  await page.goto('/settings/network');
  const remote = page.getByRole('group', { name: 'Remote access' });
  await remote.getByRole('button', { name: 'Connect' }).click();
  await page
    .getByRole('dialog', { name: 'Publish hlabs on tail9.ts.net?' })
    .getByRole('button', { name: 'Connect' })
    .click();
  await expect(remote.getByText('Connected')).toBeVisible();

  await remote.getByRole('button', { name: 'Disconnect' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Turn off remote access?' });
  await expect(dialog).toContainText("People away from home can't open hlabs or its apps until you connect again.");
  await dialog.getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByText('Remote access is off')).toBeVisible();
  await expect(remote.getByRole('button', { name: 'Connect' })).toBeVisible();
  await expect(remote.getByText('hari-home.tail9.ts.net')).toHaveCount(0);
});
