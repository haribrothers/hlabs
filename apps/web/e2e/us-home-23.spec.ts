// US-HOME-23 · See which apps are open in the Dock (main instance, desktop). A dev-only stand-in that embeds: Back to
// Home leaves its window open in the Dock with a dot, the Dock brings it back, Close app takes it out.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'dock-demo';

// A skipped run (the phone project) must leave the stand-in alone: the desktop run may be using it.
test.afterEach(async ({ request }, info) => {
  if (info.status === 'skipped') return;
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
});

test('US-HOME-23 an open window shows in the Dock with a dot until it is closed', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'Phones have the tab bar, not the Dock');
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name: 'Dock demo', embed: true } });
  await page.goto(`/apps/${ID}`);
  const win = page.getByRole('region', { name: 'App window' });
  await win.getByRole('button', { name: 'Back to Home' }).click();
  await expect(page).toHaveURL(`${MAIN_URL}/`);
  const tile = page.getByTestId('dock-bar').getByRole('button', { name: 'Dock demo, open' });
  await expect(tile).toBeVisible();

  await tile.click();
  await expect(page).toHaveURL(new RegExp(`/apps/${ID}$`));
  await win.getByRole('button', { name: 'Close app' }).click();
  await expect(page).toHaveURL(`${MAIN_URL}/`);
  await expect(page.getByTestId('dock-bar').getByRole('button', { name: /Dock demo/ })).toHaveCount(0);
});
