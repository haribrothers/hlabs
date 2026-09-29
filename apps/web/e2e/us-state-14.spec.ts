// US-STATE-14 · Toasts by severity, shown from the dev gallery: placement, roles, timers held on hover, and no
// sliding with Reduce motion.
import { expect, test } from '@playwright/test';

test('US-STATE-14 toasts sit bottom-right (above the tab bar on a phone), hold while hovered and match their tone', async ({
  page,
}, testInfo) => {
  await page.clock.install();
  await page.goto('/dev/ui');
  await page.getByRole('button', { name: 'Show danger toast' }).click();
  await page.getByRole('button', { name: 'Show success toast' }).click();
  const danger = page.getByRole('alert').filter({ hasText: "Uptime Kuma couldn't start" });
  const success = page.getByRole('status').filter({ hasText: 'Immich is ready' });
  await expect(danger).toContainText('Port 3001 is already in use by another program.');
  await expect(success).toBeVisible();

  const box = (await success.boundingBox())!;
  const viewport = page.viewportSize()!;
  if (testInfo.project.name === 'phone') {
    // The real tab bar (the gallery also shows one as a sample): the fixed one.
    const tabBarTop = await page
      .getByRole('navigation', { name: 'Tab bar' })
      .evaluateAll((navs) =>
        Math.min(
          ...navs
            .filter(
              (n) =>
                getComputedStyle(n).position === 'fixed' || getComputedStyle(n.parentElement!).position === 'fixed',
            )
            .map((n) => n.getBoundingClientRect().top),
        ),
      );
    expect(Number.isFinite(tabBarTop)).toBe(true);
    expect(box.y + box.height).toBeLessThanOrEqual(tabBarTop);
  } else {
    expect(viewport.width - (box.x + box.width)).toBeLessThan(40);
    expect(viewport.height - (box.y + box.height)).toBeLessThan(40);
  }

  // Hovering holds it past 5 s; it goes once the pointer leaves and the rest of the time runs out.
  await success.hover();
  await page.clock.runFor(8_000);
  await expect(success).toBeVisible();
  await page.mouse.move(1, 1);
  await page.clock.runFor(6_000);
  await expect(success).toBeHidden();
  // Danger stays until dismissed.
  await page.clock.runFor(60_000);
  await expect(danger).toBeVisible();
  await danger.getByRole('button', { name: 'Dismiss' }).click();
  await expect(danger).toBeHidden();
});

test('US-STATE-14 with Reduce motion toasts appear without sliding', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev/ui');
  await page.getByRole('button', { name: 'Show warning toast' }).click();
  const warning = page.getByRole('status').filter({ hasText: 'Low disk space' });
  await expect(warning).toBeVisible();
  expect(await warning.evaluate((el) => getComputedStyle(el).animationDuration)).toBe('0s');
});
