// US-APP-04 · See an app's status and start, stop or restart it (main instance, admin, desktop). A dev-only stand-in;
// starting and stopping a real app are covered by the daemon and component tests.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'settings-demo';

test.afterEach(async ({ request }) => {
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
});

test('US-APP-04 App settings shows the status, the Overview tab and the actions; a stopped app offers Start', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name === 'phone', 'App settings on a phone is 12-phone.md');
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name: 'Settings demo' } });
  await page.goto(`/apps/${ID}/settings`);
  const settings = page.getByRole('region', { name: 'App settings' });
  await expect(settings.getByRole('heading', { level: 1, name: 'Settings demo' })).toBeVisible();
  await expect(settings.getByText('Running')).toBeVisible();
  await expect(settings.getByRole('tablist', { name: 'App sections' }).getByRole('tab')).toHaveText(['Overview']);
  for (const name of ['Open', 'Restart', 'Stop', 'Logs']) {
    await expect(settings.getByRole('button', { name, exact: true })).toBeVisible();
  }

  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name: 'Settings demo', state: 'stopped' } });
  await page.reload();
  await expect(settings.getByRole('button', { name: 'Start', exact: true })).toBeEnabled();
  await expect(settings.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  await settings.getByRole('button', { name: 'Logs', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/apps/${ID}/logs$`));
});
