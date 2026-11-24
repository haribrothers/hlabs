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
    // Account, Users, Appearance, Network & remote access, Storage, Engine & startup.
    await page.keyboard.press('ArrowDown');
    await expect(nav.getByRole('link', { name: 'Users' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
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

  test('the window fills the space above the Dock; only its content scrolls, fading under a fixed title with the scrollbar below it; the divider is a hairline', async ({
    page,
  }) => {
    await page.goto('/settings/account');
    const nav = page.getByRole('navigation', { name: 'Settings sections' });
    await expect(nav).toBeVisible();
    // Lots of content (say, many signed-in devices).
    await page.getByTestId('settings-scroll').evaluate((pane) => {
      const tall = document.createElement('div');
      tall.style.height = '3000px';
      pane.querySelector('.hl-scroll-pane-body')!.append(tall);
    });
    const scroll = page.getByTestId('settings-scroll');
    const layout = await page.evaluate(() => {
      const pane = document.querySelector<HTMLElement>('[data-testid="settings-scroll"]')!;
      const sidebar = document.querySelector('nav[aria-label="Settings sections"]')!.closest<HTMLElement>('.border-r')!;
      return {
        page: document.scrollingElement!.scrollHeight - document.scrollingElement!.clientHeight,
        main: document.querySelector('main')!.scrollHeight - document.querySelector('main')!.clientHeight,
        pane: pane.scrollHeight - pane.clientHeight,
        divider: getComputedStyle(sidebar).borderRightColor,
      };
    });
    expect(layout.page).toBe(0);
    expect(layout.main).toBeLessThanOrEqual(1);
    expect(layout.pane).toBeGreaterThan(1000);
    expect(layout.divider).toBe('rgba(255, 255, 255, 0.08)');

    // The title stays while the content scrolls, and the scroll area sits inside the window's edges.
    await scroll.evaluate((el) => (el.scrollTop = 2000));
    await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeInViewport();
    // The title has no box and no blur: content fades out as it goes under it (macOS style), and the scrollbar
    // starts below it.
    const bar = page
      .locator('.hl-scroll-pane-header')
      .filter({ has: page.getByRole('heading', { level: 1, name: 'Account' }) });
    await expect(bar).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(bar).toHaveCSS('backdrop-filter', 'none');
    await expect(scroll).toHaveCSS('mask-image', /linear-gradient/);
    const barHeight = (await bar.boundingBox())!.height;
    const track = await scroll.evaluate((el) => getComputedStyle(el, '::-webkit-scrollbar-track').marginTop);
    expect(Math.abs(parseFloat(track) - barHeight)).toBeLessThanOrEqual(1);
    const window = (await nav.locator('xpath=ancestor::section[1]').boundingBox())!;
    const area = (await scroll.boundingBox())!;
    expect(window.x + window.width - (area.x + area.width)).toBeGreaterThanOrEqual(16);
    expect(window.y + window.height - (area.y + area.height)).toBeGreaterThanOrEqual(16);
    // As tall as an app window: it ends 105px above the bottom, just clear of the Dock.
    const dock = (await page.getByRole('navigation', { name: 'Dock' }).boundingBox())!;
    expect(Math.round(page.viewportSize()!.height - (window.y + window.height))).toBe(105);
    expect(dock.y).toBeGreaterThan(window.y + window.height);
  });
});

test.describe('US-ACCT-02 phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout');

  // The phone layout of D-172: a section is a page you go into; it scrolls as a whole, and once its large title has
  // scrolled away a compact bar keeps "‹ Settings" and the title at the top.
  test('a section scrolls as a page, under a compact bar with "‹ Settings" and its title', async ({ page }) => {
    await page.goto('/settings/account');
    const back = page.getByRole('main').getByRole('button', { name: 'Settings' });
    await expect(back).toBeVisible();
    const main = page.locator('#main');
    await main.evaluate((el) => {
      const tall = document.createElement('div');
      tall.style.height = '3000px';
      el.append(tall);
    });
    const bar = page.locator('.hl-p-bar');
    // Scrolled again until it holds: a page you go into starts at the top, and the router can put it there just after
    // the page appears.
    await expect(async () => {
      await main.evaluate((el) => (el.scrollTop = 2000));
      await expect(bar).toHaveAttribute('data-collapsed', 'true', { timeout: 500 });
    }).toPass();
    await expect(bar.getByRole('button', { name: 'Settings' })).toBeInViewport();
    await expect(bar.getByText('Account', { exact: true })).toBeInViewport();
    const scrolls = await page.evaluate(
      () => document.scrollingElement!.scrollHeight - document.scrollingElement!.clientHeight,
    );
    expect(scrolls).toBe(0);
  });

  test('the list comes first; a section opens as a page with a "‹ Settings" back control', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    // Values at the right of some rows (PhoneRedesignA_Settings), as they load.
    const sections = page.getByRole('navigation', { name: 'Settings sections' });
    await expect(sections.getByRole('link', { name: /^Users/ })).toHaveText(/^Users\s*\d+$/);
    await expect(sections.getByRole('link', { name: /^Storage/ })).toHaveText(/free$/);
    await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Account' }).tap();
    await expect(page).toHaveURL(/\/settings\/account$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
    await page.getByRole('main').getByRole('button', { name: 'Settings' }).tap();
    await expect(page).toHaveURL(/\/settings$/);

    // A deep link opens straight to the section, with the back control, which then goes to the list.
    await page.goto('/settings/account');
    await expect(page.getByRole('main').getByRole('button', { name: 'Settings' })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Tab bar' }).getByRole('button', { name: 'Settings' }),
    ).toHaveAttribute('aria-current', 'page');
    await page.getByRole('main').getByRole('button', { name: 'Settings' }).tap();
    await expect(page).toHaveURL(/\/settings$/);
  });
});
