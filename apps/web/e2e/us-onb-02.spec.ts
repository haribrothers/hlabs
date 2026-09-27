// US-ONB-02 · See the welcome screen and start setup. Runs serially on the first-run instance because
// Get started moves the shared onboarding step forward.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';

test.use({ baseURL: FIRST_RUN_URL });

test.describe('US-ONB-02', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(({ isMobile }) => isMobile, 'one run is enough: this story changes the shared onboarding step');

  test('the welcome screen, then Enter on Get started opens the system check', async ({ page, request }) => {
    const { url } = (await (await request.get('/dev/setup-url')).json()) as { url: string };
    await page.goto(url);

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
