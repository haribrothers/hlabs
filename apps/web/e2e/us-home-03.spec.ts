// US-HOME-03 · Open my apps from the grid (main instance, signed in as an admin). Installing arrives in phase 2;
// a dev-only stand-in app is added and removed here.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

/** One stand-in app per project, since desktop and phone run at the same time. */
const idFor = (project: string) => `e2e-grid-${project}`;

test.afterEach(async ({ request }, info) => {
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: idFor(info.project.name), remove: true } });
});

test('US-HOME-03 an installed app appears on Home, opens in a new tab and disappears when removed', async ({
  page,
  request,
  context,
}, info) => {
  const ID = idFor(info.project.name);
  const name = `Grid ${info.project.name}`;
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const tile = page.getByRole('button', { name: `Open ${name}` });
  await expect(tile).toHaveCount(0);

  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name } });
  await expect(tile).toBeVisible({ timeout: 5000 });
  await expect(tile).toContainText(name);

  const [tab] = await Promise.all([context.waitForEvent('page'), tile.click()]);
  expect(tab.url()).toMatch(new RegExp(`^https://${ID}\\.[a-z0-9-]+\\.local/?$|^chrome-error:`));
  await tab.close();

  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
  await expect(tile).toHaveCount(0, { timeout: 5000 });
});
