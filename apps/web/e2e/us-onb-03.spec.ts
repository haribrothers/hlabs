// US-ONB-03 · Resume onboarding where I left off, and only until it's done (first-run instance).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL, resetOnboarding } from './instances';

test.use({ baseURL: FIRST_RUN_URL });

test.describe('US-ONB-03', () => {
  test('opening the setup URL again goes straight to the saved step', async ({ page, request }) => {
    await page.goto(await resetOnboarding(request, 'storage'));
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/storage`);
    const progress = page.getByRole('navigation', { name: 'Setup progress' });
    await expect(progress).toContainText('Step 4 of 4');
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
    await expect(page.getByRole('navigation', { name: 'Setup progress' })).toContainText('Step 1 of 4');
    await expect(page.getByRole('heading', { level: 1, name: 'Checking this computer' })).toBeFocused();

    // Steps that haven't shipped (remote access, phase 3) aren't reachable.
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

    const res = await request.post('/trpc/onboarding.setStep', {
      data: { step: 'system' },
      headers: { 'x-hlabs-setup': token },
    });
    expect(res.status()).toBe(403);
    expect(((await res.json()) as { error: { data: { hlabsCode: string } } }).error.data.hlabsCode).toBe(
      'ONBOARDING_COMPLETE',
    );
  });
});
