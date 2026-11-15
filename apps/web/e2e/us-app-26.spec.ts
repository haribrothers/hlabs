// US-APP-26 · Know when an app stops working, for real (phase 4 follow-ups "Done when"; main instance, serial). A tiny
// test app (fixtures/crash-demo) is installed; its container is stopped behind hlabs's back, as a crash that Docker
// doesn't fix. Within a minute the app is in error, the admin sees "Crash demo stopped working" and its tile says so.
// The app is uninstalled with its data afterwards.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { E2E_STORE_DIR, MAIN_URL } from './instances';

const ID = 'crash-demo';
const APP_DIR = join(E2E_STORE_DIR, 'apps', ID);
const FIXTURE = new URL('./fixtures/crash-demo', import.meta.url).pathname;
/** The e2e instance's compose projects (HLABS_COMPOSE_PREFIX, D-090). */
const PROJECT = `hlabs-e2e-${ID}`;

/** tRPC as the signed-in admin, from inside the page (as us-store-17-rollback.spec.ts). */
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
const app = async (page: Page) => {
  const res = await trpc(page, 'apps.get', { appId: ID }).catch(() => undefined);
  if (!res) return undefined;
  return res.result?.data ?? null;
};

async function offer(request: APIRequestContext, on: boolean) {
  rmSync(APP_DIR, { recursive: true, force: true });
  if (on) cpSync(FIXTURE, APP_DIR, { recursive: true });
  expect((await request.post(`${MAIN_URL}/dev/sync-store`)).ok()).toBe(true);
}

test.afterEach(async ({ page, request }, info) => {
  if (info.status === 'skipped') return;
  if (page.url() === 'about:blank') await page.goto('/');
  test.setTimeout(240_000);
  if (await app(page)) {
    await trpc(page, 'apps.uninstall', { appId: ID, keepData: false }, true);
    await expect.poll(async () => app(page), { timeout: 120_000 }).toBeNull();
  }
  await offer(request, false);
});

test('US-APP-26 an app whose container is stopped behind its back goes to error and the admin is told', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name !== 'serial', 'One real crash is enough');
  test.setTimeout(300_000);
  await page.goto('/');
  await offer(request, true);
  const install = await trpc(page, 'apps.install', { appId: ID, env: {}, mounts: [], acceptRisks: false }, true);
  expect(install.error).toBeUndefined();
  await expect.poll(async () => (await app(page))?.state, { timeout: 180_000 }).toBe('running');

  // Stopped by hand, so Docker's restart policy leaves it down: a crash Docker doesn't fix.
  const ids = execFileSync('docker', ['ps', '-q', '--filter', `label=com.docker.compose.project=${PROJECT}`])
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean);
  expect(ids.length).toBeGreaterThan(0);
  execFileSync('docker', ['stop', '-t', '1', ...ids]);

  await page.goto('/');
  // A warning toast is a status (only danger ones are alerts, US-STATE-14).
  const toast = page
    .getByRole('status')
    .filter({ hasText: 'Crash demo stopped working' })
    .filter({ hasText: 'Restart' });
  await expect(toast).toBeVisible({ timeout: 70_000 });
  await expect(toast.getByText('It quit unexpectedly.')).toBeVisible();
  await expect(toast.getByRole('button', { name: 'Restart' })).toBeVisible();
  await expect(toast.getByRole('link', { name: 'View logs' })).toBeVisible();
  expect((await app(page))?.state).toBe('error');
  await expect(page.getByRole('button', { name: 'Crash demo, error', exact: true })).toBeVisible();

  // The tile opens its logs, which say what happened.
  await page.getByRole('button', { name: 'Crash demo, error', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Crash demo stopped working' })).toContainText(
    'It quit unexpectedly.',
  );
});
