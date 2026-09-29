// US-ONB-12 · Save recovery codes (first-run instance).
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, createAdminInUi, turnOnTwoFactor } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test.describe('US-ONB-12', () => {
  test('download the codes, then Continue to storage', async ({ page, request }) => {
    await createAdminInUi(page, request);
    const codes = await turnOnTwoFactor(page);
    for (const code of codes) expect(code).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
    await expect(
      page.getByText("Save these somewhere safe. Each code works once and you won't see them again."),
    ).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('hlabs-recovery-codes.txt');
    const text = await readFile((await download.path())!, 'utf8');
    expect(text).toContain(`Username: ${ADMIN.username}`);
    expect(text).toMatch(/Server: \S+/);
    expect(text).toMatch(/Created: \d{4}-\d{2}-\d{2}/);
    for (const code of codes) expect(text).toContain(code);

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/storage`);
    await expect(page.getByRole('heading', { level: 1, name: 'Where should your data live?' })).toBeFocused();
  });

  test('a reload before Continue does not show the codes again', async ({ page, request }) => {
    await createAdminInUi(page, request);
    await turnOnTwoFactor(page);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Two-factor is on' })).toBeVisible();
    await expect(page.getByText('You can make new recovery codes later in Account settings.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Recovery codes' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/storage`);
  });
});
