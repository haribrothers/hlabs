// US-APP-20 · Resource use tiles and 24-hour chart (main instance, admin, desktop). A dev-only stand-in installed just
// now: the tiles, the metric choice and "Collecting data"; values, gaps and the tooltip are covered by the component
// and daemon tests.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'usage-demo';

// A skipped run (the phone project) must leave the stand-in alone: the desktop run may be using it.
test.afterEach(async ({ request }, info) => {
  if (info.status === 'skipped') return;
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
});

test('US-APP-20 the Usage tab shows the tiles and a 24-hour chart that is still collecting data', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name === 'phone', 'App settings on a phone is 12-phone.md');
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name: 'Usage demo' } });
  await page.goto(`/apps/${ID}/settings`);
  await page.getByRole('tab', { name: 'Usage' }).click();
  const tiles = page.getByRole('group', { name: 'Resource use' });
  await expect(tiles.getByText('CPU', { exact: true })).toBeVisible();
  await expect(tiles.getByText('Memory', { exact: true })).toBeVisible();
  await expect(tiles.getByText('Disk', { exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Memory' })).toBeChecked();
  await expect(page.getByRole('heading', { name: 'Memory · last 24 hours' })).toBeVisible();
  await expect(page.getByText('Collecting data — check back in a few minutes.')).toBeVisible();
  await page.getByRole('radio', { name: 'Network' }).click();
  await expect(page.getByRole('heading', { name: 'Network · last 24 hours' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
