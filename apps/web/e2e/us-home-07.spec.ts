// US-HOME-07 · Act on an app from its menu (main instance, admin, desktop). A dev-only stand-in: the menu's items,
// Esc back to the tile, and Settings; running commands on a real app is covered by the component and daemon tests.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'menu-demo';

// A skipped run (the phone project) must leave the stand-in alone: the desktop run may be using it.
test.afterEach(async ({ request }, info) => {
  if (info.status === 'skipped') return;
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
});

test('US-HOME-07 right-clicking a tile opens its menu; Esc returns to the tile; Settings opens', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name === 'phone', 'Long-press on phones is 12-phone.md');
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name: 'Menu demo' } });
  await page.goto('/');
  const tile = page.getByRole('button', { name: 'Open Menu demo' });
  await tile.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Menu demo' });
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Open',
    'Settings',
    'View logs',
    'Restart',
    'Stop',
    'Uninstall…',
  ]);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(tile).toBeFocused();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await expect(page).toHaveURL(new RegExp(`/apps/${ID}/settings$`));
});
