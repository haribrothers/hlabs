// US-ACCT-04 · See the devices I am signed in on (first-run instance, after onboarding).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ACCT-04 this device first, then the others', async ({ page, request, browser }) => {
  await finishOnboarding(page, request);
  // A second device.
  const other = await (
    await browser.newContext({
      baseURL: FIRST_RUN_URL,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    })
  ).newPage();
  await other.goto('/login/username');
  await other.getByLabel('Username').fill(ADMIN.username);
  await other.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await other.getByRole('button', { name: 'Log in' }).click();
  await expect(other).toHaveURL(`${FIRST_RUN_URL}/`);

  await page.goto('/settings/account');
  const list = page.getByRole('group', { name: 'Signed-in devices' });
  await expect(list.locator('.hl-list-row')).toHaveCount(2);
  await expect(list.locator('.hl-list-row').first()).toContainText('This device');
  await expect(list.locator('.hl-list-row').first()).toContainText('This computer · active now');
  await expect(list.locator('.hl-list-row').nth(1)).toContainText('iPhone · Safari');
});
