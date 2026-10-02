// US-ACCT-26 · Access changes apply straight away (first-run instance: an admin and a member, each in a browser).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createMember } from './invites';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test("US-ACCT-26 removing an app takes its tile off the member's open Home within 2 seconds", async ({
  page,
  request,
  browser,
}, info) => {
  await finishOnboarding(page, request);
  await request.post(`${FIRST_RUN_URL}/dev/fake-app`, { data: { id: 'shared-demo', name: 'Shared demo' } });
  const name = 'Anu';
  const member = await createMember(page, request, FIRST_RUN_URL, { name, apps: ['Shared demo'] });

  const home = await (await browser.newContext({ ...info.project.use, baseURL: FIRST_RUN_URL })).newPage();
  await home.goto('/login/username');
  await home.getByLabel('Username').fill(member.username);
  await home.getByLabel('Password', { exact: true }).fill(member.password);
  await home.getByRole('button', { name: 'Log in' }).click();
  await expect(home).toHaveURL(`${FIRST_RUN_URL}/`);
  const tile = home.getByRole('button', { name: 'Open Shared demo' });
  await expect(tile).toBeVisible();

  await page.goto('/settings/users');
  await page.locator('.hl-list-row', { hasText: name }).getByRole('button', { name: 'Apps access' }).click();
  const dialog = page.getByRole('dialog', { name: /What Anu can open/ });
  await dialog.getByRole('switch', { name: 'Shared demo' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  await expect(tile).toBeHidden({ timeout: 2_000 });
  // And back: it reappears, no new log-in.
  await page.locator('.hl-list-row', { hasText: name }).getByRole('button', { name: 'Apps access' }).click();
  await page
    .getByRole('dialog', { name: /What Anu can open/ })
    .getByRole('switch', { name: 'Shared demo' })
    .click();
  await page
    .getByRole('dialog', { name: /What Anu can open/ })
    .getByRole('button', { name: 'Save' })
    .click();
  await expect(tile).toBeVisible({ timeout: 2_000 });
});
