// US-SITE-12 · Visit a private, accessible site.
import { expect, test } from '@playwright/test';
import { accessibleInBothThemes } from './helpers';

const PAGES = ['/', '/download/', '/apps/', '/apps/immich/', '/releases/', '/privacy/', '/help/', '/help/install/mac/'];

test.describe('US-SITE-12', () => {
  test('sets no cookies and loads nothing from other sites, fonts included', async ({ page, context }) => {
    const elsewhere: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('http://127.0.0.1:') && !r.url().startsWith('data:')) elsewhere.push(r.url());
    });
    for (const path of PAGES) await page.goto(path, { waitUntil: 'networkidle' });
    expect(elsewhere).toEqual([]);
    expect(await context.cookies()).toEqual([]);
    const fonts = await page.evaluate(() => [...document.fonts].map((f) => f.family));
    expect(fonts.join(',')).toContain('Plus Jakarta Sans');
  });

  test('the Privacy page says there are no analytics or cookies, and how long access logs are kept', async ({
    page,
  }) => {
    await page.goto('/privacy/');
    await expect(page.getByText('It sets no cookies and has no analytics, trackers or ads.')).toBeVisible();
    await expect(page.getByText(/keeps standard access logs .* for up to 30 days/)).toBeVisible();
  });

  test("follows the system's theme, and the theme picked is remembered here and in the help", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'light' });
    const page = await context.newPage();
    await page.goto('/');
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(await background()).toBe('rgb(247, 245, 252)');

    await page.getByRole('button', { name: 'Use the dark theme' }).click();
    expect(await background()).toBe('rgb(16, 12, 34)');
    await page.reload();
    expect(await background()).toBe('rgb(16, 12, 34)');
    await page.goto('/help/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await context.close();
  });

  test('Reduce motion stops every animation', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    const moving = await page.evaluate(() =>
      [...document.querySelectorAll('*')]
        .filter((el) => {
          const s = getComputedStyle(el);
          return s.animationName !== 'none' && s.animationPlayState === 'running';
        })
        .map((el) => el.className.toString()),
    );
    expect(moving).toEqual([]);
    // The looping copy of the app row is gone; the row wraps instead.
    await expect(page.locator('.marquee-dup')).toBeHidden();
    await context.close();
  });

  test('"Skip to content" comes first, and focus is always visible', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
    expect(outline).not.toBe('none');
  });

  for (const path of ['/privacy/', '/releases/']) {
    test(`${path} passes axe in both themes`, async ({ page }) => {
      await page.goto(path);
      await accessibleInBothThemes(page);
    });
  }
});
