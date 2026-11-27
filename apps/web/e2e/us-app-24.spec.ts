// US-APP-24 and US-APP-25 · Reinstall a broken app, for real (phase 4 follow-ups "Done when"; main instance, serial). A
// tiny test app (fixtures/crash-demo) is installed, then its containers and image are removed by hand. hlabs notices it
// stopped working (US-APP-26); from its Logs, Reinstall… and Reinstall bring it back running. Uninstalled afterwards.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { E2E_STORE_DIR, MAIN_URL } from './instances';

const ID = 'crash-demo';
const APP_DIR = join(E2E_STORE_DIR, 'apps', ID);
const FIXTURE = new URL('./fixtures/crash-demo', import.meta.url).pathname;
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
  await expect
    .poll(async () => ((await app(page))?.state as string | undefined) ?? 'gone', { timeout: 180_000 })
    .toMatch(/^(running|stopped|error|install_failed|gone)$/);
  if (await app(page)) {
    await trpc(page, 'apps.uninstall', { appId: ID, keepData: false }, true);
    await expect.poll(async () => app(page), { timeout: 120_000 }).toBeNull();
  }
  await offer(request, false);
});

test('US-APP-24 a broken app whose containers and image were removed is reinstalled from its Logs', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name !== 'serial', 'One real reinstall is enough');
  test.setTimeout(360_000);
  await page.goto('/');
  await offer(request, true);
  const install = await trpc(page, 'apps.install', { appId: ID, env: {}, mounts: [], acceptRisks: false }, true);
  expect(install.error).toBeUndefined();
  await expect.poll(async () => (await app(page))?.state, { timeout: 180_000 }).toBe('running');

  // Its containers and image removed behind hlabs's back.
  const ids = execFileSync('docker', ['ps', '-aq', '--filter', `label=com.docker.compose.project=${PROJECT}`])
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean);
  const images = execFileSync('docker', ['inspect', '--format', '{{.Image}}', ...ids])
    .toString()
    .trim()
    .split('\n');
  execFileSync('docker', ['rm', '-f', ...ids]);
  execFileSync('docker', ['rmi', '-f', ...new Set(images)]);
  await expect.poll(async () => (await app(page))?.state, { timeout: 90_000 }).toBe('error');

  // Its tile opens its Logs: Reinstall…, then Reinstall in the dialog.
  await page.goto('/');
  await page.getByRole('button', { name: 'Crash demo, error', exact: true }).click();
  const card = page.getByRole('status').filter({ hasText: 'Crash demo stopped working' });
  await card.getByRole('button', { name: 'Reinstall…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reinstall Crash demo?' });
  await expect(dialog.getByText('Kept as they are')).toBeVisible();
  await dialog.getByRole('button', { name: 'Reinstall', exact: true }).click();
  await expect(dialog).toBeHidden();

  // It reinstalls and runs again, with its containers back.
  await expect.poll(async () => (await app(page))?.state, { timeout: 180_000 }).toBe('running');
  const back = execFileSync('docker', ['ps', '-q', '--filter', `label=com.docker.compose.project=${PROJECT}`])
    .toString()
    .trim();
  expect(back).not.toBe('');
  // On Linux, Docker adding the app's network changes this computer's network, and Chrome then drops what's loading
  // (ERR_NETWORK_CHANGED): load Home again until it's there.
  await expect(async () => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Open Crash demo', exact: true })).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
});
