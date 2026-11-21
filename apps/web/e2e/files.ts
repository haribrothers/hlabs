// Files specs (07-files) on the main instance: its storage root is `<e2e data dir>/storage` (set by
// /dev/complete-onboarding). Specs put their own files in a folder of their own, so desktop and phone runs never meet.
import type { Page } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const STORAGE_ROOT = resolve(process.env.HLABS_E2E_DATA_DIR ?? '../../.e2e-data', 'storage');

/** The signed-in admin's username, asked from the page (its session cookie is Secure, so only the browser sends it). */
export async function username(page: Page): Promise<string> {
  if (!page.url().startsWith('http')) await page.goto('/');
  const body = (await page.evaluate(async () => (await fetch('/trpc/auth.me')).json())) as {
    result?: { data: { username: string } };
  };
  if (!body.result) throw new Error(`auth.me: ${JSON.stringify(body)}`);
  return body.result.data.username;
}

/** A folder of this test's own in the admin's Home, with files in it; removed by the returned function. */
export async function homeFolder(page: Page, name: string, files: Record<string, string | Buffer> = {}) {
  const dir = join(STORAGE_ROOT, 'users', await username(page), name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const path = join(dir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return { dir, path: `/home/${name}`, remove: () => rmSync(dir, { recursive: true, force: true }) };
}
