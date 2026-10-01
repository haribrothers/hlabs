// US-APP-08 · Follow an app's logs live (main instance, admin, desktop). A dev-only stand-in with no containers shows
// the empty view; reading and following real container logs is covered by the daemon tests.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'logs-empty-demo';

// A skipped run (the phone project) must leave the stand-in alone: the desktop run may be using it.
test.afterEach(async ({ request }, info) => {
  if (info.status === 'skipped') return;
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
});

test('US-APP-08 Logs opens from App settings, titled "<App> logs", following, and empty without output', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name === 'phone', 'Logs on a phone is 12-phone.md');
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name: 'Quiet demo' } });
  await page.goto(`/apps/${ID}/settings`);
  await page.getByRole('button', { name: 'Logs', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Quiet demo logs' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Following' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('log').getByText(/No logs yet\.|Couldn't load the logs/)).toBeVisible();
  await page.getByRole('button', { name: 'Back to app settings' }).click();
  await expect(page).toHaveURL(new RegExp(`/apps/${ID}/settings$`));
});
