// US-AUTH-03 · Log in with username and password (first-run instance, after onboarding).
import { expect, test, type Page } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, createAdminInUi, finishOnboarding, turnOnTwoFactor } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

async function signedInAs(page: Page) {
  return page.evaluate(async () => {
    const res = await fetch('/trpc/auth.me');
    const body = (await res.json()) as { result?: { data: { username: string } } };
    return body.result?.data.username ?? null;
  });
}

const dashboard = (page: Page) =>
  page.getByRole('navigation', { name: 'Dock' }).or(page.getByRole('navigation', { name: 'Tab bar' }));

test.describe('US-AUTH-03', () => {
  test('log in with username and password, from the form or the account list', async ({ page, request, browser }) => {
    await finishOnboarding(page, request);

    const typed = await (await browser.newContext({ baseURL: FIRST_RUN_URL })).newPage();
    await typed.goto('/login/username');
    await typed.getByLabel('Username').fill('Hari ');
    await typed.getByLabel('Password', { exact: true }).fill(ADMIN.password);
    await typed.getByLabel('Password', { exact: true }).press('Enter');
    await expect(typed).toHaveURL(`${FIRST_RUN_URL}/`);
    await expect(dashboard(typed)).toBeVisible();
    expect(await signedInAs(typed)).toBe('hari');

    const picked = await (await browser.newContext({ baseURL: FIRST_RUN_URL })).newPage();
    await picked.goto('/login/users');
    await picked.getByRole('button', { name: 'Hari Prasad, Admin' }).click();
    await picked.getByPlaceholder('Password').fill(ADMIN.password);
    await picked.getByRole('button', { name: 'Log in' }).click();
    await expect(picked).toHaveURL(`${FIRST_RUN_URL}/`);
    expect(await signedInAs(picked)).toBe('hari');
  });

  test('with two-factor on, the password step asks for the code and does not sign in yet', async ({
    page,
    request,
    browser,
  }) => {
    await createAdminInUi(page, request);
    await turnOnTwoFactor(page);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Open dashboard' }).click();

    const other = await (await browser.newContext({ baseURL: FIRST_RUN_URL })).newPage();
    await other.goto('/login/username');
    await other.getByLabel('Username').fill('hari');
    await other.getByLabel('Password', { exact: true }).fill(ADMIN.password);
    await other.getByRole('button', { name: 'Log in' }).click();
    await expect(other).toHaveURL(/\/login\/code\?challenge=/);
    expect(await signedInAs(other)).toBeNull();
  });
});
