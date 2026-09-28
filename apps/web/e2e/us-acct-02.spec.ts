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

test.describe('US-ACCT-02 phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout');

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
