// Invites made through the real InviteDialog, for the people stories (US-ACCT-21…, US-AUTH-23/24).
import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';

/** Opens Users › Invite someone, applies the choices, presses Done, and returns the link. */
export async function createInvite(
  page: Page,
  opts: { name?: string; role?: 'Member' | 'Admin'; apps?: string[] } = {},
): Promise<string> {
  await page.goto('/settings/users');
  await page.getByRole('button', { name: 'Invite someone' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invite someone' });
  const link = dialog.getByRole('textbox', { name: 'Invite link' });
  await expect(link).toHaveValue(/\/invite\//);
  if (opts.role === 'Admin') await dialog.getByRole('radio', { name: /Admin/ }).click();
  for (const app of opts.apps ?? []) await dialog.getByRole('switch', { name: app }).click();
  if (opts.name) await dialog.getByLabel('Their name (optional)').fill(opts.name);
  const url = await link.inputValue();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  // The link names hlabs.local; open it on the instance under test.
  return new URL(url).pathname;
}

/**
 * A member made through a real invite: the admin page makes the link, and it's accepted over the API (no browser
 * session changes hands). Returns their username and password.
 */
export async function createMember(
  page: Page,
  request: APIRequestContext,
  baseURL: string,
  opts: { name: string; apps?: string[]; role?: 'Member' | 'Admin' },
) {
  const path = await createInvite(page, { role: opts.role, apps: opts.apps });
  const username = `m${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const password = 'correct horse battery staple';
  const res = await request.post(`${baseURL}/trpc/invites.accept`, {
    data: { token: path.split('/').pop(), displayName: opts.name, username, password },
  });
  expect(res.ok()).toBe(true);
  return { username, password };
}

/** A new browser signed in as `who` (username and password), on Home. */
export async function signedInAs(
  browser: Browser,
  use: object,
  baseURL: string,
  who: { username: string; password: string },
) {
  const page = await (await browser.newContext({ ...use, baseURL })).newPage();
  await page.goto('/login/username');
  await page.getByLabel('Username').fill(who.username);
  await page.getByLabel('Password', { exact: true }).fill(who.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(`${baseURL}/`);
  return page;
}

/** Takes away fake apps a spec added to a first-run instance (other specs count its apps). */
export async function removeFakeApps(request: APIRequestContext, baseURL: string, ids: string[]) {
  for (const id of ids) await request.post(`${baseURL}/dev/fake-app`, { data: { id, remove: true } });
}
