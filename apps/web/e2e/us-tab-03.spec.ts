// US-TAB-03 · Drag by touch (tablet project): in Home's edit mode a held tile follows the finger and drops where it
// lifts while the page holds still (main instance, nothing saved); in Files a held file moved over a folder says "Move to
// Taxes" and goes there when the finger lifts, with Undo (main instance); a pinned Dock app moves along the Dock (a
// first-run instance: the Dock is per person, and the main one's is shared with the other specs).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { homeFolder } from './files';
import { FIRST_RUN_URL, MAIN_URL } from './instances';
import { removeFakeApps } from './invites';
import { finishOnboarding } from './onboarding';
import { box, centre, dock, Finger, touchDrag, trpcCall } from './tablet';

test.describe('main instance', () => {
  test.describe.configure({ mode: 'serial' });
  const IDS = ['tab03-a', 'tab03-b', 'tab03-c'];
  test.beforeEach(async ({ request }) => {
    for (const [i, id] of IDS.entries())
      await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id, name: `Tab drag ${'ABC'[i]}`, state: 'running' } });
  });
  test.afterEach(async ({ request }) => {
    await removeFakeApps(request, MAIN_URL, IDS);
  });

  test('US-TAB-03 in edit mode a held tile follows the finger and drops where it lifts; the page holds still', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Edit Home' }).click();
    const apps = page.getByRole('list', { name: 'Apps' });
    // The sortable tiles (dnd-kit), each named after its app.
    const tile = (name: string) => apps.locator(`[aria-roledescription="sortable"][aria-label="${name}"]`);
    await expect(tile('Tab drag A')).toBeVisible();
    const order = async () =>
      (
        await apps
          .locator('[aria-roledescription="sortable"]')
          .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
      ).filter((n): n is string => !!n && n.startsWith('Tab drag'));
    expect(await order()).toEqual(['Tab drag A', 'Tab drag B', 'Tab drag C']);
    const main = page.locator('#main');
    const scrolled = await main.evaluate((el) => el.scrollTop);
    // A past C: hold A, move it onto C's place, lift.
    const finger = await Finger.down(page, await centre(tile('Tab drag A')));
    await finger.hold(400);
    const c = await centre(tile('Tab drag C'));
    await finger.move({ x: c.x + 10, y: c.y }, 16);
    expect(await main.evaluate((el) => el.scrollTop)).toBe(scrolled);
    await finger.hold(250);
    await finger.up();
    await expect.poll(order).toEqual(['Tab drag B', 'Tab drag C', 'Tab drag A']);
    // Nothing saved: Escape throws the change away.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Edit Home' })).toBeVisible();
  });

  test('US-TAB-03 a held file moved over a folder goes there when the finger lifts, with Undo', async ({ page }) => {
    const folder = await homeFolder(page, 'tab03-files', {
      'Taxes/a.txt': 'a',
      'Work/b.txt': 'b',
      'note.txt': 'hello',
    });
    try {
      await page.goto(`/files?path=${encodeURIComponent(folder.path)}`);
      const note = page.locator(`[data-path="${folder.path}/note.txt"]`);
      const taxes = page.locator(`[data-path="${folder.path}/Taxes"]`);
      await expect(note).toBeVisible();
      const finger = await Finger.down(page, await centre(note));
      await finger.hold();
      // Held: its menu; moving on, the menu goes and the file follows the finger.
      await expect(page.getByRole('menu')).toBeVisible();
      await finger.move(await centre(taxes), 12);
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect(page.getByText('Lift your finger on a folder to move it there')).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: 'Move to Taxes' })).toBeVisible();
      await finger.up();
      await expect(page.getByText('Moved “note.txt” to Taxes')).toBeVisible();
      await expect.poll(() => readdirSync(join(folder.dir, 'Taxes')).sort()).toEqual(['a.txt', 'note.txt']);
      await page.getByRole('button', { name: 'Undo' }).click();
      await expect.poll(() => readdirSync(folder.dir).includes('note.txt')).toBe(true);
    } finally {
      folder.remove();
    }
  });

  test('US-TAB-03 a file dropped where there is no folder stays where it was', async ({ page }) => {
    const folder = await homeFolder(page, 'tab03-nowhere', { 'Taxes/a.txt': 'a', 'note.txt': 'hello' });
    try {
      await page.goto(`/files?path=${encodeURIComponent(folder.path)}`);
      const note = page.locator(`[data-path="${folder.path}/note.txt"]`);
      await expect(note).toBeVisible();
      const b = await box(note);
      await touchDrag(page, note, { x: b.x + b.width / 2, y: b.y + b.height + 200 });
      await expect(page.getByText('Lift your finger on a folder to move it there')).toBeHidden();
      expect(readdirSync(folder.dir).sort()).toEqual(['Taxes', 'note.txt']);
    } finally {
      folder.remove();
    }
  });
});

test.describe('first-run instance', () => {
  test.use({ baseURL: FIRST_RUN_URL });
  const PINS = ['tab03-pin-a', 'tab03-pin-b', 'tab03-pin-c'];
  test.afterEach(async ({ request }) => {
    await removeFakeApps(request, FIRST_RUN_URL, PINS);
  });

  test('US-TAB-03 a held pinned app moves along the Dock and drops where the finger lifts', async ({
    page,
    request,
  }) => {
    await finishOnboarding(page, request);
    for (const [i, id] of PINS.entries())
      await request.post(`${FIRST_RUN_URL}/dev/fake-app`, { data: { id, name: `Pin ${'ABC'[i]}` } });
    expect((await trpcCall(page, 'home.saveDock', { appIds: PINS }, true)).error).toBeUndefined();
    await page.goto('/');
    const pins = () =>
      dock(page)
        .locator('[data-pinned]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-dock-app')));
    await expect.poll(pins).toEqual(PINS);
    const a = dock(page).getByRole('button', { name: 'Pin A' });
    const c = await box(dock(page).getByRole('button', { name: 'Pin C' }));
    // A past C.
    await touchDrag(page, a, { x: c.x + c.width - 4, y: c.y + c.height / 2 });
    await expect.poll(pins).toEqual(['tab03-pin-b', 'tab03-pin-c', 'tab03-pin-a']);
    // Saved for this person.
    await page.reload();
    await expect.poll(pins).toEqual(['tab03-pin-b', 'tab03-pin-c', 'tab03-pin-a']);
  });
});
