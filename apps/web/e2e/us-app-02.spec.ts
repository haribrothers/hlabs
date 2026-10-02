// US-APP-02 · App window controls (main instance, admin, desktop). Restarting a real app is covered by the daemon and
// component tests; here, the controls and where they lead.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'controls-demo';

// A skipped run (the phone project) must leave the stand-in alone: the desktop run may be using it.
test.afterEach(async ({ request }, info) => {
  if (info.status === 'skipped') return;
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
});

test('US-APP-02 the window header has the admin controls; Logs and App settings open over the window', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name === 'phone', 'The app window is the desktop layout');
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name: 'Controls demo', embed: true } });
  await page.goto(`/apps/${ID}`);
  const win = page.getByRole('region', { name: 'App window' });
  for (const name of ['Restart app', 'Logs', 'App settings', 'Open in a new tab', 'Close app']) {
    await expect(win.getByRole('button', { name })).toHaveAttribute('title', name);
  }
  // Dialogs over the window (D-096): the window stays behind them, and the Dock stays below it.
  await win.getByRole('button', { name: 'Logs' }).click();
  await expect(page).toHaveURL(new RegExp(`/apps/${ID}\\?panel=logs$`));
  const logs = page.getByRole('dialog', { name: 'Controls demo logs' });
  await expect(logs.getByRole('heading', { name: 'Controls demo logs' })).toBeVisible();
  await logs.getByRole('button', { name: 'Back to Controls demo' }).click();
  await expect(logs).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/apps/${ID}$`));

  await win.getByRole('button', { name: 'App settings' }).click();
  const settings = page.getByRole('dialog', { name: 'App settings' });
  await expect(settings.getByRole('heading', { name: 'Controls demo', exact: true })).toBeVisible();
  // Logs from App settings: Back returns to App settings.
  await settings.getByRole('button', { name: 'Logs', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Controls demo logs' })
    .getByRole('button', { name: 'Back to app settings' })
    .click();
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(settings).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/apps/${ID}$`));
  await expect(page.getByTestId('dock-bar').getByRole('button', { name: 'Controls demo, open' })).toBeVisible();
});
