// US-APP-09 · Filter logs (main instance, admin, desktop). A dev-only stand-in (one service, so no Container choice);
// filtering lines and choosing a container are covered by the component and daemon tests.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'filter-demo';

// A skipped run (the phone project) must leave the stand-in alone: the desktop run may be using it.
test.afterEach(async ({ request }, info) => {
  if (info.status === 'skipped') return;
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
});

test('US-APP-09 the logs toolbar filters, and an empty result offers "Clear filters"', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name === 'phone', 'Logs on a phone is 12-phone.md');
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name: 'Filter demo' } });
  await page.goto(`/apps/${ID}/logs`);
  await expect(page.getByRole('radiogroup', { name: 'Container' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Errors only' }).click();
  await expect(page.getByRole('button', { name: 'Errors only' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('searchbox', { name: 'Filter logs' }).fill('nothing like it');
  const log = page.getByRole('log');
  await expect(log.getByText(/No lines match these filters\.|Couldn't load the logs/)).toBeVisible();
  if (await log.getByRole('button', { name: 'Clear filters' }).count()) {
    await log.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByRole('searchbox', { name: 'Filter logs' })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Errors only' })).toHaveAttribute('aria-pressed', 'false');
  }
});
