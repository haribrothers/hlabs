// US-PHONE-24 · Run as a standalone web app, against the dashboard built for production (the pwa project), at phone
// size: offline, the saved shell says "Can't reach hlabs" full screen with Try again, not a browser error, and loads
// once hlabs answers. Standalone detection, "Remember this phone" on in the home-screen app and the one reload onto a
// new version are in the unit test (src/health/us-phone-24.test.tsx).
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('US-PHONE-24 offline, the home-screen app shows "Can\'t reach hlabs" with Try again', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await context.setOffline(true);
  await page.goto('/');
  const heading = page.getByRole('heading', { name: "Can't reach hlabs" });
  await expect(heading).toBeVisible();
  // Full screen on the phone: the message fits its width.
  const box = (await heading.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  const retry = page.getByRole('button', { name: 'Try again' });
  await expect(retry).toBeVisible();

  await context.setOffline(false);
  await retry.click();
  await expect(heading).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole('navigation', { name: 'Tab bar' })).toBeVisible();
});
