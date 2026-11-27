// US-TAB-06 · The on-screen keyboard and the Home Screen app on a tablet (tablet project, main instance). The
// keyboard: while it's up (data-keyboard, src/lib/phone-viewport.ts, tested with a real visual viewport in
// us-tab-06.test.tsx) the Dock steps aside and a dialog sits in what's left of the screen with its field in view. The
// Home Screen app: with the iPad's safe areas (the status bar, the home indicator) the Dock floats above the home
// indicator, windows start below the status bar, and iOS 26's band under the app (data-vgap) takes the wallpaper's
// base colour rather than the phone tab bar's.
import { expect, test } from '@playwright/test';
import { box, dock } from './tablet';

test('US-TAB-06 with the keyboard up the Dock steps aside and a dialog stays in reach above it', async ({ page }) => {
  await page.goto('/files');
  await page.getByRole('button', { name: 'New folder' }).tap();
  const dialog = page.getByRole('dialog', { name: 'New folder' });
  const field = dialog.getByRole('textbox');
  await expect(field).toBeFocused();
  // The keyboard takes the lower half of the screen (as watchPhoneViewport reports it).
  const visible = 400;
  await page.evaluate((h) => {
    document.documentElement.style.setProperty('--hl-visual-height', `${h}px`);
    document.documentElement.setAttribute('data-keyboard', 'open');
  }, visible);
  // (The dialog hides the page from screen readers, so the Dock is looked at by its test id.)
  const bar = page.getByTestId('dock-bar');
  await expect(bar).toHaveCSS('display', 'none');
  const d = await box(dialog);
  expect(d.y).toBeGreaterThanOrEqual(0);
  expect(d.y + d.height).toBeLessThanOrEqual(visible);
  const f = await box(field);
  expect(f.y + f.height).toBeLessThanOrEqual(visible);
  await expect(dialog.getByRole('button', { name: 'Create' })).toBeInViewport();
  await page.evaluate(() => document.documentElement.removeAttribute('data-keyboard'));
  await expect(bar).toHaveCSS('display', 'flex');
});

test('US-TAB-06 as a Home Screen app: clear of the status bar and the home indicator, no odd band under the Dock', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 24, bottom: 20, left: 0, right: 0 } });
  await page.goto('/settings/account');
  const height = page.viewportSize()!.height;
  // The Dock: 16px above the 20px home indicator.
  const d = await box(dock(page));
  expect(Math.round(height - (d.y + d.height))).toBe(36);
  // The window: 8px under the 24px status bar, and it ends above the Dock.
  const win = await box(page.locator('.hl-window-fill'));
  expect(Math.round(win.y)).toBe(32);
  expect(win.y + win.height).toBeLessThan(d.y);
  // iOS 26's band (index.html measures it): the wallpaper's base colour, as the page behind the Dock.
  await page.evaluate(() => document.documentElement.setAttribute('data-vgap', ''));
  const base = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--wall-base').trim(),
  );
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const probe = await page.evaluate((c) => {
    const el = document.createElement('div');
    el.style.backgroundColor = c;
    document.body.append(el);
    const v = getComputedStyle(el).backgroundColor;
    el.remove();
    return v;
  }, base);
  expect(bg).toBe(probe);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 0, right: 0 } });
});
