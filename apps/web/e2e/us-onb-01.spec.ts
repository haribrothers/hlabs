// US-ONB-01 · Open onboarding automatically on first run. Runs against the first-run instance (no admin yet).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';

test.use({ baseURL: FIRST_RUN_URL });

async function setupUrl(request: APIRequestContext): Promise<string> {
  const res = await request.get('/dev/setup-url');
  const { url } = (await res.json()) as { url: string | null };
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:5174\/setup\?token=[A-Za-z0-9_-]{43}$/);
  return url!;
}

test.describe('US-ONB-01', () => {
  test('the printed setup URL starts onboarding and the token leaves the address bar', async ({ page, request }) => {
    const url = await setupUrl(request);
    const token = new URL(url).searchParams.get('token')!;

    const statusCall = page.waitForRequest((req) => req.url().includes('/trpc/onboarding.status'));
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome to hlabs' })).toBeVisible();
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup`);
    expect(await page.evaluate(() => sessionStorage.getItem('hlabs.setupToken'))).toBe(token);
    expect((await statusCall).headers()['x-hlabs-setup']).toBe(token);

    // No Dock or tab bar during onboarding.
    await expect(page.getByRole('navigation', { name: 'Dock' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Tab bar' })).toHaveCount(0);
  });

  test('the dashboard sends this browser back to onboarding while it is not finished', async ({ page, request }) => {
    await page.goto(await setupUrl(request));
    await expect(page.getByRole('heading', { name: 'Welcome to hlabs' })).toBeVisible();
    await page.goto('/settings');
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup`);
  });

  test('another device without the token is told to finish setup on the computer', async ({ page }) => {
    for (const path of ['/', '/setup', '/files']) {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Finish setup on the computer running hlabs.' }),
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Welcome to hlabs' })).toHaveCount(0);
    }
  });

  test('onboarding calls without the token are refused', async ({ request }) => {
    const res = await request.post('/trpc/onboarding.setStep', { data: { step: 'system' } });
    expect(res.status()).toBe(403);
    const body = (await res.json()) as { error: { data: { hlabsCode: string } } };
    expect(body.error.data.hlabsCode).toBe('ONBOARDING_SETUP_TOKEN_REQUIRED');
  });
});

for (const theme of ['glass', 'solid'] as const) {
  test(`US-ONB-01 axe finds no violations on the first-run pages (${theme})`, async ({ page, request }) => {
    for (const url of ['/', await setupUrl(request)]) {
      await page.goto(url);
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await page.getByRole('heading', { level: 1 }).waitFor();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    }
  });
}
