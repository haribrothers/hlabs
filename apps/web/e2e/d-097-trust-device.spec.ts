// D-097 · Trust hlabs on this device (main instance): the certificate to download and the steps for each device.
// The app window's address check only runs over HTTPS, so it's covered by the unit tests.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('D-097 the trust page offers the certificate and steps for each device', async ({ page }) => {
  await page.goto('/trust');
  await expect(page.getByRole('heading', { level: 1, name: 'Trust hlabs on this device' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download certificate' })).toHaveAttribute('href', '/ca.crt');
  await page.getByRole('radio', { name: 'Android' }).click();
  await expect(page.getByRole('list', { name: 'Android' }).getByRole('listitem')).toHaveCount(3);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
