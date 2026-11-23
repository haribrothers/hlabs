// US-ACCT-33 · Choose an accent colour (first-run instance: a fresh admin, so the main instance keeps its look).
import { expect, test, type Locator } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

/** A switch's track colour: its own background, or on a phone its ::before (drawn inside its 44px target). */
const trackColour = (el: Locator) =>
  el.evaluate((node) => {
    const own = getComputedStyle(node).backgroundColor;
    return own === 'rgba(0, 0, 0, 0)' ? getComputedStyle(node, '::before').backgroundColor : own;
  });

test('US-ACCT-33 a swatch changes the accent everywhere at once, arrow keys move it, and a reload paints it first', async ({
  page,
  request,
}) => {
  await finishOnboarding(page, request);
  await page.goto('/settings/appearance');
  const swatches = page.getByRole('radiogroup', { name: 'Accent colour' });
  await expect(swatches.getByRole('radio')).toHaveCount(4);
  for (const name of ['Violet', 'Mint', 'Amber', 'Rose'])
    await expect(swatches.getByRole('radio', { name })).toBeVisible();
  await expect(swatches.getByRole('radio', { name: 'Violet' })).toHaveAttribute('aria-checked', 'true');
  const html = page.locator('html');
  const switchOn = page.getByRole('switch', { name: 'Show widgets' });

  await swatches.getByRole('radio', { name: 'Mint' }).click();
  await expect(html).toHaveAttribute('data-accent', 'mint');
  // Accent-coloured components follow without a reload: a Switch that's on uses Mint's strong accent.
  // (On a phone the track is drawn by the switch's ::before, inside its 44px target.)
  await expect.poll(() => trackColour(switchOn)).toBe('rgb(13, 148, 136)');

  // Arrow keys move the choice.
  await swatches.getByRole('radio', { name: 'Mint' }).focus();
  const saved = page.waitForResponse((r) => r.url().includes('settings.appearance.update'));
  await page.keyboard.press('ArrowRight');
  await expect(html).toHaveAttribute('data-accent', 'amber');
  await expect(swatches.getByRole('radio', { name: 'Amber' })).toBeFocused();
  await expect(swatches.getByRole('radio', { name: 'Amber' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => trackColour(switchOn)).toBe('rgb(217, 119, 6)');

  // After a reload the accent is there before hlabs has asked who's signed in.
  await saved;
  await page.route('**/trpc/auth.me**', () => new Promise(() => {}));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(html).toHaveAttribute('data-accent', 'amber');
  await page.unroute('**/trpc/auth.me**');

  // Saved for the account: a browser that has never seen it gets it from hlabs.
  const fresh = await page
    .context()
    .browser()!
    .newContext({ storageState: await page.context().storageState() });
  const other = await fresh.newPage();
  await other.evaluate(() => localStorage.clear()).catch(() => undefined);
  await other.goto(`${FIRST_RUN_URL}/`);
  await expect(other.locator('html')).toHaveAttribute('data-accent', 'amber');
  await fresh.close();
});
