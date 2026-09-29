// US-ONB-08 · Create the admin account (first-run instance).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL, resetOnboarding } from './instances';

test.use({ baseURL: FIRST_RUN_URL });

test.describe('US-ONB-08', () => {
  test('creates the admin, signs in and opens two-factor', async ({ page, request, context }) => {
    await page.goto(await resetOnboarding(request, 'account'));
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/account`);
    await expect(page.getByRole('navigation', { name: 'Setup progress' })).toContainText('Step 2 of 4');
    await expect(page.getByRole('heading', { level: 1, name: 'Create your admin account' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.getByLabel('Your name').fill('Hari Prasad');
    await expect(page.getByLabel('Username')).toHaveValue('hari');
    await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
    await expect(page.getByText('Strong · at least 12 characters')).toBeVisible();
    await page.getByLabel('Confirm password').fill('correct horse battery');
    await page.getByLabel('Confirm password').press('Enter');

    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/twoFactor`);
    await expect(page.getByRole('heading', { level: 1, name: 'Add two-factor login' })).toBeFocused();

    const session = (await context.cookies()).find((c) => c.name === 'hlabs_session');
    expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', expires: -1 });

    const status = (await (await request.get('/trpc/onboarding.status')).json()) as {
      result: { data: { step: string; hasUsers: boolean } };
    };
    expect(status.result.data).toMatchObject({ step: 'twoFactor', hasUsers: true });
  });

  test('Back from the account step keeps the system check results', async ({ page, request }) => {
    await page.goto(await resetOnboarding(request, 'account'));
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/system`);
    await expect(page.getByRole('heading', { level: 1, name: 'Checking this computer' })).toBeVisible();
  });
});
