// US-ONB-16 · Use network storage (NAS), first-run instance. A real NAS isn't available here, so this uses an
// address that can't exist (.invalid) and checks the error lands where it should.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createAdminInUi, skipTwoFactor } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ONB-16 the NAS form tests the connection and shows why it failed', async ({ page, request }) => {
  await createAdminInUi(page, request);
  await skipTwoFactor(page);
  await page.getByRole('radio', { name: /Network storage \(NAS\)/ }).click();

  await expect(page.getByRole('radiogroup', { name: 'Protocol' })).toBeVisible();
  await expect(page.getByLabel('Username')).toBeVisible();
  await page.getByRole('radio', { name: 'NFS', exact: true }).click();
  await expect(page.getByLabel('Username')).toHaveCount(0);
  await page.getByRole('radio', { name: 'SMB', exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByLabel('Address').fill('nas.invalid/media');
  await page.getByLabel('Username').fill('hari');
  await page.getByLabel('Password', { exact: true }).fill('not-a-real-password');
  await page.getByRole('button', { name: 'Continue' }).click();

  // On this machine the share can't be reached; on a Linux box without the installed helper hlabs says so.
  const unreachable = page.getByText("Can't reach nas.invalid. Check the address and that the NAS is on.");
  const noHelper = page.getByText("hlabs can't connect network storage on this computer yet.");
  await expect(unreachable.or(noHelper)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/storage`);
});
