// US-STORE-17 · An update that doesn't start rolls back, for real (phase 2 "Done when"; main instance, serial). A test
// app goes into the e2e instance's copy of the store (fixtures/rollback-demo): 1.0.0 is installed, then 1.1.0, which
// listens on the wrong port and never passes its health check, is offered and Update is pressed. hlabs goes back to
// 1.0.0, which answers again, and the app's page says so. The app is uninstalled with its data afterwards.
import { expect, test, type APIRequestContext } from '@playwright/test';
import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { E2E_STORE_DIR, MAIN_URL } from './instances';

const ID = 'rollback-demo';
const APP_DIR = join(E2E_STORE_DIR, 'apps', ID);
const FIXTURE = (version: 'v1' | 'v2') => new URL(`./fixtures/rollback-demo/${version}`, import.meta.url).pathname;

/**
 * tRPC as the signed-in admin, through Playwright's request context (the main instance's session; mutations carry
 * the CSRF header), so polling doesn't depend on the page.
 */
async function trpc(request: APIRequestContext, path: string, input?: unknown, mutation = false) {
  const res = mutation
    ? await request.post(`/trpc/${path}`, {
        headers: { 'x-hlabs-csrf': await csrf(request) },
        data: input,
      })
    : await request.get(`/trpc/${path}${input ? `?input=${encodeURIComponent(JSON.stringify(input))}` : ''}`);
  return (await res.json()) as { result?: { data: Record<string, unknown> }; error?: unknown };
}
async function csrf(request: APIRequestContext) {
  const me = (await (await request.get('/trpc/auth.me')).json()) as { result?: { data: { csrfToken: string } } };
  return me.result?.data.csrfToken ?? '';
}
const app = async (request: APIRequestContext) =>
  (await trpc(request, 'apps.get', { appId: ID }).catch(() => null))?.result?.data ?? null;

async function offer(request: APIRequestContext, version: 'v1' | 'v2' | null) {
  rmSync(APP_DIR, { recursive: true, force: true });
  if (version) cpSync(FIXTURE(version), APP_DIR, { recursive: true });
  const res = await request.post(`${MAIN_URL}/dev/sync-store`);
  expect(res.ok()).toBe(true);
}

test.afterEach(async ({ request }, info) => {
  if (info.status === 'skipped') return;
  test.setTimeout(240_000);
  // Settled first (an update or rollback may still be going), then uninstalled with its data.
  await expect
    .poll(async () => ((await app(request))?.state as string | undefined) ?? 'gone', { timeout: 180_000 })
    .toMatch(/^(running|stopped|error|install_failed|gone)$/);
  if (await app(request)) {
    await trpc(request, 'apps.uninstall', { appId: ID, keepData: false }, true);
    await expect.poll(async () => app(request), { timeout: 120_000 }).toBeNull();
  }
  await offer(request, null);
});

test('US-STORE-17 a new version that does not start is rolled back to the one that worked', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name !== 'serial', 'One real install and update is enough');
  test.setTimeout(300_000);
  await page.goto('/');

  // 1.0.0, installed for real.
  await offer(request, 'v1');
  const install = await trpc(request, 'apps.install', { appId: ID, env: {}, mounts: [], acceptRisks: false }, true);
  expect(install.error).toBeUndefined();
  await expect.poll(async () => (await app(request))?.state, { timeout: 180_000 }).toBe('running');
  expect((await app(request))?.version).toBe('1.0.0');

  // 1.1.0 is offered; Update in App settings.
  await offer(request, 'v2');
  await page.goto(`/apps/${ID}?panel=settings`);
  const settings = page.getByRole('dialog', { name: 'App settings' });
  await expect(settings.getByText('Version 1.0.0 · 1.1.0 available')).toBeVisible();
  await settings.getByRole('button', { name: 'Update' }).click();

  // It goes updating → rolling_back → running, on 1.0.0 again.
  await expect.poll(async () => (await app(request))?.state, { timeout: 120_000 }).toBe('rolling_back');
  await expect.poll(async () => (await app(request))?.state, { timeout: 120_000 }).toBe('running');
  const after = (await app(request))!;
  expect(after.version).toBe('1.0.0');
  expect(after.latestVersion).toBe('1.1.0');

  // The app's page says what happened.
  await page.goto(`/store/app/${ID}`);
  const banner = page.getByRole('status').filter({ hasText: 'rolled it back' });
  await expect(banner.getByText("Rollback demo's update didn't start, so hlabs rolled it back")).toBeVisible();
  await expect(banner.getByText("It's running 1.0.0 again.")).toBeVisible();
  await banner.getByRole('button', { name: 'Dismiss' }).click();
  await expect(banner).toHaveCount(0);
});
