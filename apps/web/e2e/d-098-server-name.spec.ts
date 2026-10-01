// D-098 · The name on the network on setup's system step (first-run instance): prefilled "hlabs" with ".local", a
// name that isn't valid says how and holds Continue, and Continue saves the one chosen.
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL, resetOnboarding } from './instances';

test.use({ baseURL: FIRST_RUN_URL });

test('D-098 choose the name on the network during setup', async ({ page, request }) => {
  await page.goto(await resetOnboarding(request, 'system'));
  const field = page.getByLabel('Name on your network');
  await expect(field).toHaveValue('hlabs');
  await expect(page.getByText('.local', { exact: true })).toBeVisible();
  const cont = page.getByRole('button', { name: 'Continue' });
  await expect(page.getByRole('group').getByText('Checking…')).toHaveCount(0, { timeout: 20_000 });
  test.skip(!(await cont.isEnabled()), 'no container engine running on this machine');

  await field.fill('home-');
  await expect(
    page.getByText('Use lowercase letters, numbers and dashes, starting and ending with a letter or number.'),
  ).toBeVisible();
  await expect(cont).toBeDisabled();
  await field.fill('Home Box');
  await expect(field).toHaveValue('home-box');
  await expect(page.getByText(/open hlabs at home-box\.local/)).toBeVisible();
  await cont.click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/account`);
  // Back on the system step, it's the name chosen.
  await page.goto('/setup/system');
  await expect(page.getByLabel('Name on your network')).toHaveValue('home-box');
  await resetOnboarding(request, 'welcome');
});
