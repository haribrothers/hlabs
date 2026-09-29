// US-ONB-02 · See the welcome screen and start setup (first-run instance).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL, resetOnboarding } from './instances';

test.use({ baseURL: FIRST_RUN_URL });

test.describe('US-ONB-02', () => {
  test('the welcome screen, then Enter on Get started opens the system check', async ({ page, request }) => {
    await page.goto(await resetOnboarding(request));

    await expect(page.getByRole('heading', { level: 1, name: 'Welcome to hlabs' })).toBeVisible();
    await expect(page.getByText('Your own cloud, running on this computer.')).toBeVisible();
    await expect(page.getByText('Setup takes about five minutes')).toBeVisible();
    await expect(page.getByText(/^Step \d/)).toHaveCount(0);
    await expect(page.getByText('Restore from a backup instead')).toHaveCount(0);
    const start = page.getByRole('button', { name: 'Get started' });
    await expect(start).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/system`);
    await expect(page.getByRole('heading', { level: 1, name: 'Checking this computer' })).toBeVisible();

    const status = (await (await request.get('/trpc/onboarding.status')).json()) as {
      result: { data: { step: string } };
    };
    expect(status.result.data.step).toBe('system');
  });
});
