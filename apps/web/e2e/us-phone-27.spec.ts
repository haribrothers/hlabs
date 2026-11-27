// US-PHONE-27 · Live usage, notifications and updates on the phone in the new design (main instance, admin;
// PhoneRedesignA_Usage, _Notifications, _StoreUpdates, _Updates).
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';
import { box, phoneOnly } from './phone';

// A store app of its own at an older version (US-STORE-15 uses Open WebUI on phones).
const ID = 'excalidraw';

test('US-PHONE-27 Live usage: a large title, the range across the page, the tiles two to a row, the chart in a box', async ({
  page,
}, info) => {
  phoneOnly(info);
  await page.goto('/usage');
  await expect(page.getByRole('heading', { level: 1, name: 'Live usage' })).toHaveClass(/hl-p-large/, {
    timeout: 30_000,
  });
  const range = page.getByRole('radiogroup', { name: 'Time range' });
  const viewport = page.viewportSize()!;
  expect(Math.round((await box(range)).width)).toBe(viewport.width - 32);
  const tiles = page.getByRole('group', { name: 'Summary' });
  const cpu = await box(tiles.getByRole('button', { name: /^CPU/ }));
  const memory = await box(tiles.getByRole('button', { name: /^Memory/ }));
  const storage = await box(tiles.getByRole('button', { name: /^Storage/ }));
  expect(Math.round(memory.y)).toBe(Math.round(cpu.y));
  expect(storage.y).toBeGreaterThan(cpu.y + cpu.height - 1);
  await expect(page.locator('section.hl-p-card').first()).toBeVisible();
  await range.getByRole('radio', { name: '24 hours' }).click();
  await expect(range.getByRole('radio', { name: '24 hours' })).toHaveAttribute('aria-checked', 'true');
});

test('US-PHONE-27 the bell: a sheet with "Mark all read" and ✕ beside its title, and Today as an inset box', async ({
  page,
  request,
}, info) => {
  phoneOnly(info);
  await request.post(`${MAIN_URL}/dev/notify`, { data: { title: 'Phone sheet check', severity: 'info' } });
  await page.goto('/');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Notifications' });
  await expect(sheet.locator('.hl-sheet-handle')).toBeVisible();
  const head = sheet.locator('.hl-sheet-head');
  await expect(head.getByRole('button', { name: 'Mark all read' })).toBeVisible();
  await expect(head.getByRole('button', { name: 'Close' })).toBeVisible();
  const today = sheet.getByRole('region', { name: 'Today' });
  await expect(today.locator('.hl-p-group')).toBeVisible();
  await expect(today.getByText('Phone sheet check').first()).toBeVisible();
  await head.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();
});

test.describe('updates', () => {
  test.afterEach(async ({ request }) => {
    await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
  });

  test('US-PHONE-27 App Store › Updates and Settings › Updates: Update all in the bar, Update pills, inset rows', async ({
    page,
    request,
  }, info) => {
    phoneOnly(info);
    const added = await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, behind: '0.0.1' } });
    expect(added.status()).toBe(200);
    await page.goto('/store/updates');
    await expect(page.getByRole('heading', { level: 1, name: 'Updates' })).toHaveClass(/hl-p-large/);
    await expect(page.locator('.hl-p-nav').getByRole('button', { name: /App Store/ })).toBeVisible();
    await expect(page.locator('.hl-p-nav').getByRole('button', { name: /^Update all \(\d+\)$/ })).toHaveText(
      'Update all',
    );
    await expect(page.locator('.hl-p-subtitle')).toContainText(/Checked|Not checked yet/);
    const row = page.getByRole('list', { name: 'Updates' }).getByRole('listitem').filter({ hasText: 'Excalidraw' });
    await expect(row.getByRole('button', { name: 'Update Excalidraw' })).toHaveClass(/hl-p-get/);
    await row.getByRole('button', { name: "What's new" }).click();
    await expect(row.getByRole('region', { name: /^What's new in / })).toBeVisible();

    await page.goto('/settings/updates');
    await expect(page.getByRole('heading', { level: 1, name: 'Updates' })).toHaveClass(/hl-p-large/);
    await expect(page.locator('.hl-p-card').first()).toBeVisible();
    const apps = page.getByRole('region', { name: /^App updates/ });
    await expect(apps.locator('li.hl-p-row').filter({ hasText: 'Excalidraw' })).toBeVisible();
    await expect(apps.getByRole('button', { name: 'Update Excalidraw' })).toHaveClass(/hl-p-get/);
  });
});
