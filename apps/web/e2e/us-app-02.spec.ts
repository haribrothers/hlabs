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

test('US-APP-02 the window header has the admin controls; Logs and App settings open their views', async ({
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
  await win.getByRole('button', { name: 'Logs' }).click();
  await expect(page).toHaveURL(new RegExp(`/apps/${ID}/logs$`));
  await expect(page.getByRole('heading', { name: 'Controls demo logs' })).toBeVisible();
  await page.goBack();
  await page.getByRole('region', { name: 'App window' }).getByRole('button', { name: 'App settings' }).click();
  await expect(page).toHaveURL(new RegExp(`/apps/${ID}/settings$`));
  // The settings view itself (its code may still be loading while the window shows).
  const settings = page.getByRole('region', { name: 'App settings' });
  await expect(settings.getByRole('heading', { name: 'Controls demo', exact: true })).toBeVisible();
  // Close goes back to the window it came from.
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/apps/${ID}$`));
});
