// US-APP-07 · Storage, resources and version (main instance, admin, desktop). A dev-only stand-in: its data folder,
// disk use and version; counting real data and images is covered by the daemon tests.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'storage-demo';

// A skipped run (the phone project) must leave the stand-in alone: the desktop run may be using it.
test.afterEach(async ({ request }, info) => {
  if (info.status === 'skipped') return;
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
});

test('US-APP-07 App settings shows the data folder, disk use and version', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'App settings on a phone is 12-phone.md');
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name: 'Storage demo' } });
  await page.goto(`/apps/${ID}/settings`);
  const storage = page.getByRole('group', { name: 'Storage and resources' });
  await expect(storage.getByText(new RegExp(`app-data/${ID}$`))).toBeVisible();
  await expect(storage.getByText(/^Disk /)).toBeVisible();
  await expect(page.getByText(/^Version .* · up to date$/)).toBeVisible();
});
