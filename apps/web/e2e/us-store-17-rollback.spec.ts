// US-STORE-17 · An update that doesn't start rolls back, for real (phase 2 "Done when"; main instance, serial). A test
// app goes into the e2e instance's copy of the store (fixtures/rollback-demo): 1.0.0 is installed, then 1.1.0, which
// listens on the wrong port and never passes its health check, is offered and Update is pressed. hlabs goes back to
// 1.0.0, which answers again, and the app's page says so. The app is uninstalled with its data afterwards.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { E2E_STORE_DIR, MAIN_URL } from './instances';

const ID = 'rollback-demo';
const APP_DIR = join(E2E_STORE_DIR, 'apps', ID);
const FIXTURE = (version: 'v1' | 'v2') => new URL(`./fixtures/rollback-demo/${version}`, import.meta.url).pathname;

/**
 * tRPC as the signed-in admin, from inside the page: the session cookie is Secure, which the browser sends to
 * 127.0.0.1 but Playwright's request contexts don't (they'd be the dev anonymous admin). Mutations carry the CSRF header.
 */
async function trpc(page: Page, path: string, input?: unknown, mutation = false) {
  return page.evaluate(
    async ({ path, input, mutation }) => {
      const me = (await (await fetch('/trpc/auth.me')).json()) as { result?: { data: { csrfToken: string } } };
      const res = mutation
        ? await fetch(`/trpc/${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-hlabs-csrf': me.result?.data.csrfToken ?? '' },
            body: JSON.stringify(input),
          })
        : await fetch(`/trpc/${path}${input ? `?input=${encodeURIComponent(JSON.stringify(input))}` : ''}`);
      return (await res.json()) as { result?: { data: Record<string, unknown> }; error?: unknown };
    },
    { path, input, mutation },
  );
}
/** The app as apps.get has it; null when it's gone, undefined when the call didn't get through (polls try again). */
const app = async (page: Page) => {
  const res = await trpc(page, 'apps.get', { appId: ID }).catch(() => undefined);
  if (!res) return undefined;
  return res.result?.data ?? null;
};

async function offer(request: APIRequestContext, version: 'v1' | 'v2' | null) {
  rmSync(APP_DIR, { recursive: true, force: true });
  if (version) cpSync(FIXTURE(version), APP_DIR, { recursive: true });
  const res = await request.post(`${MAIN_URL}/dev/sync-store`);
  expect(res.ok()).toBe(true);
}

test.afterEach(async ({ page, request }, info) => {
  if (info.status === 'skipped') return;
  if (page.url() === 'about:blank') await page.goto('/');
  test.setTimeout(240_000);
  // Settled first (an update or rollback may still be going), then uninstalled with its data.
  await expect
    .poll(
      async () => {
        const a = await app(page);
        return a === undefined ? 'unknown' : ((a?.state as string | undefined) ?? 'gone');
      },
      { timeout: 180_000 },
    )
    .toMatch(/^(running|stopped|error|install_failed|gone)$/);
  if (await app(page)) {
    await trpc(page, 'apps.uninstall', { appId: ID, keepData: false }, true);
    await expect.poll(async () => app(page), { timeout: 120_000 }).toBeNull();
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
  const install = await trpc(page, 'apps.install', { appId: ID, env: {}, mounts: [], acceptRisks: false }, true);
  expect(install.error).toBeUndefined();
  await expect.poll(async () => (await app(page))?.state, { timeout: 180_000 }).toBe('running');
  expect((await app(page))?.version).toBe('1.0.0');

  // 1.1.0 is offered; Update in App settings.
  await offer(request, 'v2');
  await page.goto(`/apps/${ID}?panel=settings`);
  const settings = page.getByRole('dialog', { name: 'App settings' });
  await expect(settings.getByText('Version 1.0.0 · 1.1.0 available')).toBeVisible();
  await settings.getByRole('button', { name: 'Update' }).click();

  // It goes updating → rolling_back → running, on 1.0.0 again.
  await expect.poll(async () => (await app(page))?.state, { timeout: 120_000 }).toBe('rolling_back');
  await expect.poll(async () => (await app(page))?.state, { timeout: 120_000 }).toBe('running');
  const after = (await app(page))!;
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
