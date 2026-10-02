// US-ONB-17 · Connect Tailscale for remote access (first-run instance, pretend Tailscale; its log-in page is
// about:blank, never the internet).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createAdminInUi, skipTwoFactor } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ONB-17 Connect, log in, and Continue to the starter apps', async ({ page, request, context }, info) => {
  await createAdminInUi(page, request);
  await skipTwoFactor(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/remote`);
  // Signed out; the log-in finishes as soon as it starts (the person signed in, in the other tab).
  await request.post(`${FIRST_RUN_URL}/dev/tailscale`, { data: { state: 'needs_login', autoComplete: true } });

  const [login] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Connect' }).click(),
  ]);
  await login.close();
  await expect(page.getByText('Connected')).toBeVisible();
  await expect(page.getByText('hlabs.tail1234.ts.net', { exact: true })).toBeVisible();
  await expect(page.getByText('After connecting, apps open at')).toBeVisible();
  if (process.env.HLABS_SHOTS)
    await page.screenshot({ path: `${process.env.HLABS_SHOTS}/onb-remote-connected-${info.project.name}.png` });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/apps`);
});
