// US-HOME-07 · Act on an app from its menu (main instance, admin, desktop). A dev-only stand-in: the menu's items,
// Esc back to the tile, and Settings; running commands on a real app is covered by the component and daemon tests.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'menu-demo';
/** Its own stand-in: tests in a file run side by side. */
const DOCK_ID = 'menu-dock-demo';

// A skipped run (the phone project) must leave the stand-in alone: the desktop run may be using it.
test.afterEach(async ({ request }, info) => {
  if (info.status === 'skipped' || info.title.includes('near the Dock')) return;
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

test('US-HOME-07 a tile near the Dock opens its menu above the Dock, never under it', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name === 'phone', 'Long-press on phones is 12-phone.md');
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: DOCK_ID, name: 'Dock menu demo' } });
  try {
    await page.goto('/');
    const tile = page.getByRole('button', { name: 'Open Dock menu demo' });
    // A window just tall enough for the menu to fit below the tile, but only by running over the Dock.
    const at = (await tile.boundingBox())!;
    await page.setViewportSize({ width: 1440, height: Math.round(at.y + at.height + 300) });
    await tile.click({ button: 'right' });
    const menu = page.getByRole('menu', { name: 'Dock menu demo' });
    await expect(menu.getByRole('menuitem', { name: 'Uninstall…' })).toBeVisible();
    const dock = (await page.getByTestId('dock-bar').locator('.hl-dock').boundingBox())!;
    const box = (await menu.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(dock.y);
    // And it's on top: the last item is what's under the pointer there.
    const last = (await menu.getByRole('menuitem', { name: 'Uninstall…' }).boundingBox())!;
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="menuitem"]')?.textContent ?? null,
      { x: last.x + last.width / 2, y: last.y + last.height / 2 },
    );
    expect(hit).toContain('Uninstall');
  } finally {
    await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: DOCK_ID, remove: true } });
  }
});
