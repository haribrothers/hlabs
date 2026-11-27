// App settings › Configuration and Permissions for real (US-APP-13…18, serial project): a tiny test app
// (fixtures/settings-demo) is offered by the e2e store, installed, and uninstalled with its data afterwards.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { E2E_STORE_DIR, MAIN_URL } from './instances';

export const ID = 'settings-demo';
const APP_DIR = join(E2E_STORE_DIR, 'apps', ID);
const FIXTURE = new URL('./fixtures/settings-demo', import.meta.url).pathname;

/** tRPC as the signed-in admin, from inside the page (as us-app-26.spec.ts). */
export async function trpc(page: Page, path: string, input?: unknown, mutation = false) {
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

export const appState = async (page: Page) => {
  const res = await trpc(page, 'apps.get', { appId: ID }).catch(() => undefined);
  if (!res) return undefined;
  return (res.result?.data ?? null) as Record<string, unknown> | null;
};

async function offer(request: APIRequestContext, on: boolean) {
  rmSync(APP_DIR, { recursive: true, force: true });
  if (on) cpSync(FIXTURE, APP_DIR, { recursive: true });
  expect((await request.post(`${MAIN_URL}/dev/sync-store`)).ok()).toBe(true);
}

/** Installs the demo app (Mail password "mail-pass") and opens its settings on `tab`. */
export async function installAndOpen(page: Page, request: APIRequestContext, tab: 'Configuration' | 'Permissions') {
  await page.goto('/');
  await offer(request, true);
  const install = await trpc(
    page,
    'apps.install',
    { appId: ID, env: { MAIL_PASSWORD: 'mail-pass' }, mounts: [], acceptRisks: false },
    true,
  );
  expect(install.error).toBeUndefined();
  await expect.poll(async () => (await appState(page))?.state, { timeout: 180_000 }).toBe('running');
  await page.goto(`/apps/${ID}/settings`);
  await page.getByRole('tablist', { name: 'App sections' }).getByRole('tab', { name: tab }).click();
}

/** Every spec using the demo app: only in the serial project, uninstalled afterwards. */
export function useSettingsDemo() {
  test.afterEach(async ({ page, request }, info) => {
    if (info.status === 'skipped') return;
    if (page.url() === 'about:blank') await page.goto('/');
    test.setTimeout(240_000);
    if (await appState(page)) {
      await trpc(page, 'apps.uninstall', { appId: ID, keepData: false }, true);
      await expect.poll(async () => appState(page), { timeout: 120_000 }).toBeNull();
    }
    await offer(request, false);
  });
}

/** "Saved. Settings demo restarted.", after a save. */
export const savedToast = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'Saved. Settings demo restarted.' });
