// US-APP-21 · Per-container usage (main instance, admin, desktop). A dev-only stand-in has no containers, so this checks
// the logs open filtered to a container from their address, as a container row opens them; the rows themselves
// (values, Stopped and Exited, pressing one) are covered by the component and daemon tests.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'containers-demo';

test.afterEach(async ({ request }, info) => {
  if (info.status === 'skipped') return;
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
});

test('US-APP-21 the Usage tab lists no containers for an app without any, and logs open filtered to one', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name === 'phone', 'App settings on a phone is 12-phone.md');
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name: 'Containers demo' } });
  await page.goto(`/apps/${ID}/settings`);
  await page.getByRole('tab', { name: 'Usage' }).click();
  await expect(page.getByRole('group', { name: 'Resource use' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Containers' })).toHaveCount(0);
  await page.goto(`/apps/${ID}/logs?service=web`);
  await expect(page.getByRole('heading', { name: 'Containers demo logs' })).toBeVisible();
  await expect(page).toHaveURL(/service=web/);
});
