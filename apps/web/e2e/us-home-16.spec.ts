// US-HOME-16…19 · Home's edit mode in a real browser (first-run instance, three stand-in apps): right-click the wallpaper,
// drag a tile with the mouse, take one off Home, add a widget from the picker, Done, and the order survives a reload.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { removeFakeApps } from './invites';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });
const IDS = ['edit-jelly', 'edit-photos', 'edit-vault'];
test.afterEach(({ request }) => removeFakeApps(request, FIRST_RUN_URL, IDS));

test('US-HOME-16 edit Home: drag, remove, add a widget, Done; it persists', async ({
  page,
  request,
  isMobile,
}, info) => {
  test.skip(isMobile, 'Home editing is for desktop (D-030)');
  await finishOnboarding(page, request);
  for (const [id, name] of [
    ['edit-jelly', 'Jelly demo'],
    ['edit-photos', 'Photo demo'],
    ['edit-vault', 'Vault demo'],
  ])
    await request.post(`${FIRST_RUN_URL}/dev/fake-app`, { data: { id, name } });
  await page.goto('/');
  const grid = page.getByRole('list', { name: 'Apps' });
  await expect(grid.getByRole('button', { name: 'Open Vault demo' })).toBeVisible();

  // A right-click on the wallpaper offers "Edit Home".
  await page.mouse.click(20, 400, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Edit Home' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Drag to rearrange' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Editing Home' })).toBeVisible();
  if (process.env.HLABS_SHOTS)
    await page.screenshot({ path: `${process.env.HLABS_SHOTS}/home-edit-${info.project.name}.png` });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Drag Vault demo with the mouse onto the first tile's place.
  const apps = page.getByRole('list', { name: 'Apps' });
  const handles = apps.locator(':scope > li [aria-roledescription]');
  const names = async () => handles.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  const before = await names();
  const from = await apps.locator('[aria-label="Vault demo"][aria-roledescription]').boundingBox();
  const to = await apps.locator(`[aria-label="${before[0]}"][aria-roledescription]`).boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + 10, from!.y + 10, { steps: 4 });
  await page.mouse.move(to!.x + to!.width / 4, to!.y + to!.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(names).not.toEqual(before);
  expect((await names())[0]).toBe('Vault demo');

  // Take an app and a widget off Home (an admin starts with four widgets: Home is full), add App status, Done.
  // dnd-kit ignores clicks for 50 ms after a drop, so the drop itself isn't a click; no person is that quick.
  await page.waitForTimeout(100);
  await page.getByRole('button', { name: 'Remove Photo demo from Home' }).click();
  await expect(page.getByRole('button', { name: 'Remove Photo demo from Home' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove widget' }).first().click();
  await page.getByRole('button', { name: 'Add widget' }).click();
  const picker = page.getByRole('dialog', { name: 'Add a widget' });
  await expect(picker.getByRole('region', { name: 'System' })).toBeVisible();
  if (process.env.HLABS_SHOTS)
    await page.screenshot({ path: `${process.env.HLABS_SHOTS}/widget-picker-${info.project.name}.png` });
  await picker.getByRole('button', { name: 'Add App status' }).click();
  await picker.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Drag to rearrange' })).toHaveCount(0);

  await page.reload();
  const after = page.getByRole('list', { name: 'Apps' });
  await expect(after.getByRole('button', { name: 'Open Vault demo' })).toBeVisible();
  await expect(after.getByRole('button', { name: 'Open Photo demo' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Widgets' }).getByText('App status')).toBeVisible();
  const first = await after.locator('li').first().getAttribute('data-app');
  expect(first).toBe('edit-vault');
});
