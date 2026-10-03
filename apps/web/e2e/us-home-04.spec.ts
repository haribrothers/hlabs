// US-HOME-04 · Move between sections with the Dock (main instance, desktop).
import { expect, test } from '@playwright/test';

test.describe('US-HOME-04', () => {
  test.skip(({ isMobile }) => isMobile, 'the Dock is for screens 768px and wider');

  test('the Dock sits 14px above the bottom, magnifies on hover and names the tile', async ({ page }) => {
    await page.goto('/');
    const dock = page.getByRole('navigation', { name: 'Dock' });
    const box = (await dock.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(Math.round(viewport.height - (box.y + box.height))).toBe(14);
    expect(Math.round(box.x + box.width / 2)).toBe(Math.round(viewport.width / 2));

    const settings = dock.getByRole('button', { name: 'Settings' });
    const tile = settings.locator('.hl-dock-tile');
    await settings.hover();
    await expect(settings.locator('.hl-dock-tip')).toHaveCSS('opacity', '1');
    await expect(tile).toHaveCSS('transform', /matrix\(1\.35/);
    // Its neighbour grows a little (Usage, from phase 4).
    const usage = dock.getByRole('button', { name: 'Usage' }).locator('.hl-dock-tile');
    await expect(usage).toHaveCSS('transform', /matrix\(1\.14/);
  });

  test('with Reduce motion the tile keeps its size but still shows its name', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const settings = page.getByRole('navigation', { name: 'Dock' }).getByRole('button', { name: 'Settings' });
    await settings.hover();
    await expect(settings.locator('.hl-dock-tip')).toHaveCSS('opacity', '1');
    await expect(settings.locator('.hl-dock-tile')).toHaveCSS('transform', 'none');
  });
});
