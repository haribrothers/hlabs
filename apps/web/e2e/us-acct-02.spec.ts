// US-ACCT-02 · Moving around Settings on desktop, phone and keyboard (main instance, signed in as an admin).
import { expect, test } from '@playwright/test';

test.describe('US-ACCT-02 desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop layout');

  test('a window with the sidebar; Enter opens a section and focuses its heading; Escape goes Home', async ({
    page,
  }) => {
    await page.goto('/');
    const dockSettings = page.getByRole('navigation', { name: 'Dock' }).getByRole('button', { name: 'Settings' });
    await dockSettings.click();
    await expect(page).toHaveURL(/\/settings\/account$/);
    await expect(dockSettings).toHaveAttribute('aria-current', 'page');

    const nav = page.getByRole('navigation', { name: 'Settings sections' });
    const account = nav.getByRole('link', { name: 'Account' });
    const navBox = (await nav.boundingBox())!;
    const heading = page.getByRole('heading', { level: 1, name: 'Account' });
    expect(navBox.x).toBeLessThan((await heading.boundingBox())!.x);

    await account.focus();
    await page.keyboard.press('ArrowDown');
    await expect(nav.getByRole('link', { name: 'Engine & startup' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/settings\/engine$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Engine & startup' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/$/);
    // Focus goes back to where it was before Settings opened: the Dock's Settings tile.
    await expect(dockSettings).toBeFocused();
    await expect(page.getByRole('navigation', { name: 'Dock' }).getByRole('button', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

test.describe('US-ACCT-02 window', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop layout');

  test('the window fills the space above the Dock; only its content scrolls, under a fixed title; the divider is a hairline', async ({
    page,
  }) => {
    await page.goto('/settings/account');
    const nav = page.getByRole('navigation', { name: 'Settings sections' });
    await expect(nav).toBeVisible();
    // Lots of content (say, many signed-in devices).
    await page.getByRole('heading', { level: 1, name: 'Account' }).evaluate((h) => {
      const tall = document.createElement('div');
      tall.style.height = '3000px';
      h.parentElement!.append(tall);
    });
    const scroll = page.getByTestId('settings-scroll');
    const layout = await page.evaluate(() => {
      const pane = document.querySelector<HTMLElement>('[data-testid="settings-scroll"]')!;
      const sidebar = document.querySelector('nav[aria-label="Settings sections"]')!.parentElement!.parentElement!;
      return {
        page: document.scrollingElement!.scrollHeight - document.scrollingElement!.clientHeight,
        main: document.querySelector('main')!.scrollHeight - document.querySelector('main')!.clientHeight,
        pane: pane.scrollHeight - pane.clientHeight,
        divider: getComputedStyle(sidebar).borderRightColor,
        scrollbar: getComputedStyle(pane).scrollbarWidth,
      };
    });
    expect(layout.page).toBe(0);
    expect(layout.main).toBeLessThanOrEqual(1);
    expect(layout.pane).toBeGreaterThan(1000);
    expect(layout.divider).toBe('rgba(255, 255, 255, 0.08)');
    expect(layout.scrollbar).toBe('thin');

    // The title stays while the content scrolls, and the scroll area sits inside the window's edges.
    await scroll.evaluate((el) => (el.scrollTop = 2000));
    await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeInViewport();
    const window = (await nav.locator('xpath=ancestor::section[1]').boundingBox())!;
    const area = (await scroll.boundingBox())!;
    expect(window.x + window.width - (area.x + area.width)).toBeGreaterThanOrEqual(16);
    expect(window.y + window.height - (area.y + area.height)).toBeGreaterThanOrEqual(16);
    const dock = (await page.getByRole('navigation', { name: 'Dock' }).boundingBox())!;
    expect(dock.y - (window.y + window.height)).toBeGreaterThanOrEqual(16);
  });
});

test.describe('US-ACCT-02 phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout');

  test('a section sheet scrolls inside, under a fixed back link and title', async ({ page }) => {
    await page.goto('/settings/account');
    const back = page.getByRole('link', { name: 'Settings' });
    await expect(back).toBeVisible();
    await page.getByRole('heading', { level: 1, name: 'Account' }).evaluate((h) => {
      const tall = document.createElement('div');
      tall.style.height = '3000px';
      h.parentElement!.append(tall);
    });
    await page.getByTestId('settings-scroll').evaluate((el) => (el.scrollTop = 2000));
    await expect(back).toBeInViewport();
    await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeInViewport();
    const scrolls = await page.evaluate(
      () => document.scrollingElement!.scrollHeight - document.scrollingElement!.clientHeight,
    );
    expect(scrolls).toBe(0);
  });

  test('the list comes first; a section opens as a sheet with a "Settings" back control', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Account' }).tap();
    await expect(page).toHaveURL(/\/settings\/account$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
    await page.getByRole('link', { name: 'Settings' }).tap();
    await expect(page).toHaveURL(/\/settings$/);

    // A deep link opens straight to the section, with the back control.
    await page.goto('/settings/account');
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Tab bar' }).getByRole('button', { name: 'Settings' }),
    ).toHaveAttribute('aria-current', 'page');
  });
});
