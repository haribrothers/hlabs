// US-SYS-30 · Opt in to beta updates (main instance, serial: the channel is everyone's): the Switch sets the channel
// and Settings › Updates says "Beta" next to the version; turning it off puts it back. Checks go to a closed port.
import { expect, test } from '@playwright/test';

test('US-SYS-30 Beta updates switches the channel, and Updates says Beta', async ({ page, isMobile }) => {
  test.skip(isMobile, 'one run is enough: the channel is shared');
  await page.goto('/settings/advanced');
  const toggle = page.getByRole('group', { name: 'Developer' }).getByRole('switch', { name: 'Beta updates' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Beta updates are on. hlabs is checking for a new version.')).toBeVisible();
  try {
    await page.goto('/settings/updates');
    const card = page.getByRole('region', { name: /hlabs/ }).first();
    await expect(card.getByText('Beta', { exact: true })).toBeVisible();
  } finally {
    await page.goto('/settings/advanced');
    const again = page.getByRole('switch', { name: 'Beta updates' });
    await expect(again).toHaveAttribute('aria-checked', 'true');
    await again.click();
    await expect(again).toHaveAttribute('aria-checked', 'false');
  }
  await page.goto('/settings/updates');
  await expect(page.getByRole('heading', { name: /hlabs/ }).first()).toBeVisible();
  await expect(page.getByText('Beta', { exact: true })).toHaveCount(0);
});
