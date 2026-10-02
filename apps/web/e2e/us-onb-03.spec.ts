// US-ONB-03 · Resume onboarding where I left off, and only until it's done (first-run instance).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL, resetOnboarding } from './instances';
import { ADMIN, createAdminInUi, skipTwoFactor } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test.describe('US-ONB-03', () => {
  test('opening the setup URL again goes straight to the saved step', async ({ page, request }) => {
    await page.goto(await resetOnboarding(request, 'storage'));
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/storage`);
    const progress = page.getByRole('navigation', { name: 'Setup progress' });
    await expect(progress).toContainText('Step 4 of 6');
    const heading = page.getByRole('heading', { level: 1, name: 'Where should your data live?' });
    await expect(heading).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    // A reload resumes at the same step.
    await page.goto('/setup');
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/storage`);
  });

  test('a later step goes back to the saved step; earlier steps stay reachable', async ({ page, request }) => {
    await page.goto(await resetOnboarding(request, 'account'));
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/account`);

    await page.goto('/setup/storage');
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/account`);
    await expect(page.getByRole('heading', { level: 1, name: 'Create your admin account' })).toBeFocused();

    await page.goto('/setup/system');
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/system`);
    await expect(page.getByRole('navigation', { name: 'Setup progress' })).toContainText('Step 1 of 6');
    await expect(page.getByRole('heading', { level: 1, name: 'Checking this computer' })).toBeFocused();

    // A step after the saved one (remote access) isn't reachable yet.
    await page.goto('/setup/remote');
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/account`);
  });

  test('after onboarding, setup routes go home and onboarding calls are refused', async ({ page, request }) => {
    const url = await resetOnboarding(request, 'storage');
    const token = new URL(url).searchParams.get('token')!;
    await page.goto(url);
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/storage`);

    expect((await request.post('/dev/complete-onboarding')).ok()).toBe(true);
    await page.goto('/setup/system');
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/`);
    // And it stays there once the dashboard has loaded (nobody to log in as: no redirect to log in).
    await expect(
      page.getByRole('navigation', { name: 'Dock' }).or(page.getByRole('navigation', { name: 'Tab bar' })),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/`);

    const res = await request.post('/trpc/onboarding.setStep', {
      data: { step: 'system' },
      headers: { 'x-hlabs-setup': token },
    });
    expect(res.status()).toBe(403);
    expect(((await res.json()) as { error: { data: { hlabsCode: string } } }).error.data.hlabsCode).toBe(
      'ONBOARDING_COMPLETE',
    );
  });

  test('once the admin exists, a signed-out browser logs in and returns to the saved step', async ({
    page,
    request,
    browser,
  }) => {
    await createAdminInUi(page, request);
    await skipTwoFactor(page);
    const setupUrl = page.url().replace(/\/setup\/storage$/, '/setup');

    // Another browser, no session: the setup URL goes to log in, then to the storage step.
    const other = await (await browser.newContext({ baseURL: FIRST_RUN_URL })).newPage();
    await other.goto(setupUrl);
    await expect(other).toHaveURL(/\/login\/(users|username)\?next=%2Fsetup%2Fstorage$/);
    if (other.url().includes('/login/users')) {
      await other.getByRole('button', { name: new RegExp(`^${ADMIN.name}`) }).click();
      await other.getByPlaceholder('Password').fill(ADMIN.password);
    } else {
      await other.getByRole('textbox', { name: 'Username' }).fill(ADMIN.username);
      await other.getByLabel('Password', { exact: true }).fill(ADMIN.password);
    }
    await other.getByRole('button', { name: 'Log in' }).click();
    await expect(other).toHaveURL(`${FIRST_RUN_URL}/setup/storage`);
    await expect(other.getByRole('heading', { level: 1, name: 'Where should your data live?' })).toBeVisible();
  });
});
