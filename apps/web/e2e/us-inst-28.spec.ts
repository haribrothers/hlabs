// US-INST-28 · Install hlabs as an app on my computer, against the dashboard built for production (the pwa project):
// the web manifest and icons, served without a session; a service worker on / that keeps only the shell; Chrome finds
// the dashboard installable; Settings › Account shows "Use hlabs as an app".
import { expect, test } from '@playwright/test';
import { PWA_URL } from './instances';

test('US-INST-28 the dashboard links its web manifest, whose icons and worker need no session', async ({
  page,
  playwright,
}) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/manifest.webmanifest');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1a1238');

  // Signed out: no cookies at all.
  const anon = await playwright.request.newContext({ baseURL: PWA_URL });
  const manifest = await (await anon.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({
    id: '/',
    name: 'hlabs',
    short_name: 'hlabs',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#1a1238',
    background_color: '#1a1238',
  });
  expect(manifest.icons).toEqual([
    expect.objectContaining({ sizes: '192x192', purpose: 'any' }),
    expect.objectContaining({ sizes: '512x512', purpose: 'any' }),
    expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
  ]);
  for (const icon of manifest.icons as Array<{ src: string }>) {
    const res = await anon.get(icon.src);
    expect(res.ok()).toBe(true);
    expect(res.headers()['content-type']).toBe('image/png');
  }
  expect((await anon.get('/sw.js')).ok()).toBe(true);
  await anon.dispose();
});

test('US-INST-28 the worker runs on / and keeps only the shell, never /trpc, /api, /auth or /healthz', async ({
  page,
}) => {
  await page.goto('/');
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe(`${PWA_URL}/`);
  // Browse a little: the dashboard calls /trpc and /healthz meanwhile.
  await page.reload();
  await page.goto('/settings/account');
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) urls.push(new URL(req.url).pathname);
    }
    return urls;
  });
  expect(cached).toContain('/index.html');
  expect(cached.filter((u) => /^\/(trpc|api|auth|healthz|dev)(\/|$)/.test(u))).toEqual([]);
  // Only the shell: not every icon chunk of the build.
  expect(cached.length).toBeLessThan(200);
});

test('US-INST-28 Chrome finds the dashboard installable', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => navigator.serviceWorker.ready);
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: Array<{ errorId: string }>;
  };
  expect(installabilityErrors).toEqual([]);
});

test('US-INST-28 Settings › Account shows "Use hlabs as an app" under the profile', async ({ page }) => {
  await page.goto('/settings/account');
  await expect(page.getByText('Use hlabs as an app')).toBeVisible();
  await expect(
    page.getByText('Open hlabs in its own window from your Dock or Start menu, without a browser tab.'),
  ).toBeVisible();
});
