// US-ONB-04 · Run the system check (first-run instance, real container engine).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL, resetOnboarding } from './instances';

test.use({ baseURL: FIRST_RUN_URL });

const ROWS = ['Processor', 'Operating system', 'Container runtime', 'Free disk space', /^Ports? /];

test.describe('US-ONB-04', () => {
  test('checks this computer, then Continue opens the account step', async ({ page, request }) => {
    await page.goto(await resetOnboarding(request, 'system'));
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/system`);
    await expect(page.getByRole('navigation', { name: 'Setup progress' })).toContainText('Step 1 of 6');
    await expect(page.getByRole('heading', { level: 1, name: 'Checking this computer' })).toBeVisible();
    await expect(page.getByText("hlabs runs apps in containers. We'll set up anything that's missing.")).toBeVisible();

    const list = page.getByRole('group');
    for (const title of ROWS) await expect(list.getByText(title).first()).toBeVisible();
    // The check can take a few seconds (the engine ping alone waits up to 5 s).
    await expect(list.getByText('Checking…')).toHaveCount(0, { timeout: 20_000 });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    const cont = page.getByRole('button', { name: 'Continue' });
    // CI's Linux runner and a development Mac both have a running engine; without one Continue stays disabled.
    const runtimeOk = await list.locator('.hl-status-running', { hasText: /OrbStack|Docker|Colima/ }).count();
    test.skip(runtimeOk === 0, 'no container engine running on this machine');
    await expect(cont).toBeEnabled();
    await cont.click();
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/account`);
    await expect(page.getByRole('heading', { level: 1, name: 'Create your admin account' })).toBeFocused();
    const status = (await (await request.get('/trpc/onboarding.status')).json()) as {
      result: { data: { step: string } };
    };
    expect(status.result.data.step).toBe('account');
  });

  test('Back returns to the welcome screen', async ({ page, request }) => {
    await page.goto(await resetOnboarding(request, 'system'));
    await expect(page.getByRole('heading', { level: 1, name: 'Checking this computer' })).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup`);
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome to hlabs' })).toBeVisible();
  });
});
