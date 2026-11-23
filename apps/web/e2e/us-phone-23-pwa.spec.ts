// US-PHONE-23 · Add hlabs to the home screen, against the dashboard built for production (the pwa project): iOS's
// apple-touch-icon and meta tags, the icon served without a session, and Chrome finding it installable at phone size.
// The manifest itself is US-INST-28's (e2e/us-inst-28.spec.ts); the one-time iOS hint is in its unit test (phase 7
// shows it once it ships, D-036).
import { expect, test } from '@playwright/test';
import { PWA_URL } from './instances';

test.use({ viewport: { width: 390, height: 844 } });

test('US-PHONE-23 iOS adds hlabs with its own icon and title; the icon needs no session', async ({
  page,
  playwright,
}) => {
  await page.goto('/');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon-180.png');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('sizes', '180x180');
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'hlabs');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');

  // Signed out: no cookies at all.
  const anon = await playwright.request.newContext({ baseURL: PWA_URL });
  const icon = await anon.get('/icons/apple-touch-icon-180.png');
  expect(icon.ok()).toBe(true);
  expect(icon.headers()['content-type']).toBe('image/png');
  const png = await icon.body();
  expect(png.readUInt32BE(16)).toBe(180);
  expect(png.readUInt32BE(20)).toBe(180);
  await anon.dispose();
});

test('US-PHONE-23 Chrome finds the dashboard installable on a phone-sized screen', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => navigator.serviceWorker.ready);
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: Array<{ errorId: string }>;
  };
  expect(installabilityErrors).toEqual([]);
});
