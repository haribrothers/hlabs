// US-ACCT-35 · Reduce transparency and motion (first-run instance: a fresh admin, so the main instance keeps its look).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

/** Elements on the page with any backdrop blur. */
const blurred = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .filter((el) => {
        const s = getComputedStyle(el);
        return (s.backdropFilter && s.backdropFilter !== 'none') || false;
      })
      .map((el) => el.className.toString()),
  );

test('US-ACCT-35 reduce transparency: the solid theme with no blur anywhere, saved', async ({
  page,
  request,
}, info) => {
  await finishOnboarding(page, request);
  await page.goto('/settings/appearance');
  const html = page.locator('html');
  const transparency = page.getByRole('switch', { name: 'Reduce transparency' });
  await expect(transparency).not.toBeChecked();
  await expect(html).toHaveAttribute('data-theme', 'glass');
  // Glass: the window and the Dock (or tab bar) blur what's behind them.
  expect((await blurred(page)).length).toBeGreaterThan(0);

  await expect(page.getByText('Solid backgrounds instead of glass, easier to read')).toBeVisible();
  const saved = page.waitForResponse((r) => r.url().includes('settings.appearance.update'));
  await transparency.click();
  await expect(html).toHaveAttribute('data-theme', 'solid');
  expect(await blurred(page)).toEqual([]);
  // The Settings window is a solid surface (MainSolid): surface-window's solid value. A phone has no window: its
  // page is the solid base colour and its lists the solid colours in both themes (D-172).
  if (info.project.name.includes('phone'))
    await expect(page.locator('.hl-list-box').first()).toHaveCSS('background-color', 'rgb(43, 35, 80)');
  else await expect(page.locator('.hl-glass-2').first()).toHaveCSS('background-color', 'rgb(34, 27, 66)');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  if (process.env.HLABS_SHOTS)
    await page.screenshot({ path: `${process.env.HLABS_SHOTS}/settings-appearance-solid-${info.project.name}.png` });

  await saved;
  await page.goto('/');
  await expect(html).toHaveAttribute('data-theme', 'solid');
  expect(await blurred(page)).toEqual([]);
});

test('US-ACCT-35 reduce motion: on from the device until changed, then my choice wins', async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await finishOnboarding(page, request);
  await page.goto('/settings/appearance');
  const html = page.locator('html');
  const motion = page.getByRole('switch', { name: 'Reduce motion' });
  await expect(page.getByText('Turns off icon bounce and window animations')).toBeVisible();
  // Never set: the device asks for less motion, so it starts on.
  await expect(motion).toBeChecked();
  await expect(html).toHaveAttribute('data-motion', 'reduced');

  // Off is a choice, and wins over the device, after a reload too.
  const saved = page.waitForResponse((r) => r.url().includes('settings.appearance.update'));
  await motion.click();
  await expect(motion).not.toBeChecked();
  await expect(html).toHaveAttribute('data-motion', 'full');
  await expect(html).toHaveCSS('--hl-dur', '200ms');
  await saved;
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Reduce motion' })).not.toBeChecked();
  await expect(html).toHaveAttribute('data-motion', 'full');

  // On, on a device that doesn't ask: motion stops (CSS durations are 0).
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('switch', { name: 'Reduce motion' }).click();
  await expect(html).toHaveAttribute('data-motion', 'reduced');
  await expect(html).toHaveCSS('--hl-dur', '0ms');
});
