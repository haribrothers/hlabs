// US-ONB-11 · Turn on two-factor login (first-run instance).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { generateSync } from 'otplib';
import { FIRST_RUN_URL } from './instances';
import { createAdminInUi } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

async function typeCode(page: Page, code: string) {
  for (let i = 0; i < 6; i++) await page.getByLabel(`Digit ${i + 1}`).fill(code[i]!);
}

test.describe('US-ONB-11', () => {
  test('scan or enter the key, confirm a code and get recovery codes', async ({ page, request }) => {
    await createAdminInUi(page, request);
    await expect(page.getByRole('navigation', { name: 'Setup progress' })).toContainText('Step 3 of 4');
    await expect(page.getByRole('heading', { level: 1, name: 'Add two-factor login' })).toBeVisible();
    await expect(page.getByText('Recommended')).toBeVisible();
    await expect(page.getByAltText('QR code for your authenticator app')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.getByRole('button', { name: "Can't scan? Enter this key instead" }).click();
    const secret = (await page.getByLabel('Setup key').innerText()).replace(/\s/g, '');
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);

    // A wrong code first.
    const right = generateSync({ secret });
    await typeCode(page, right === '000000' ? '111111' : '000000');
    await expect(page.getByText("That code didn't work. Check the time on your phone and try again.")).toBeVisible();
    await expect(page.getByLabel('Digit 1')).toBeFocused();
    await expect(page.getByLabel('Digit 1')).toHaveValue('');

    await typeCode(page, generateSync({ secret }));
    await expect(page.getByRole('heading', { level: 1, name: 'Two-factor is on' })).toBeVisible();
    const codes = page.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem');
    await expect(codes).toHaveCount(10);
    await expect(codes.first()).toHaveText(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
  });
});
