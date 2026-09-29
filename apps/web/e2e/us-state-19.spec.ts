// US-STATE-19 · The offline banner: Playwright takes the browser offline. Data stays, mutations fail at once with a
// warning toast, and the banner goes when the connection is back.
import { expect, test } from '@playwright/test';

test('US-STATE-19 offline: a banner at the top, data stays, mutations fail fast; back online it goes', async ({
  page,
  context,
}, testInfo) => {
  await page.goto('/settings/engine');
  const status = page.getByRole('status').filter({ hasText: /^Engine / });
  await expect(status).toBeVisible();
  const running = (await status.innerText()) === 'Engine running';

  await context.setOffline(true);
  const banner = page.getByRole('status').filter({ hasText: /^You're offline$/ });
  await expect(banner).toBeVisible({ timeout: 1_000 });
  // Data stays on screen.
  await expect(status).toBeVisible();

  const box = (await banner.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y).toBeLessThan(80);
  expect(box.x).toBeGreaterThanOrEqual(16);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 16);
  if (testInfo.project.name === 'phone') {
    const tabBar = (await page.getByTestId('tab-bar').boundingBox())!;
    expect(box.y + box.height).toBeLessThan(tabBar.y);
  }

  if (running) {
    await page.getByRole('button', { name: 'Restart engine' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Restart the container engine?' });
    await dialog.getByRole('button', { name: 'Restart', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText("Can't reach hlabs. Check your connection and try again.");
    await expect(page.getByText("You're offline. Try again when you're connected.")).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  }

  await context.setOffline(false);
  await expect(banner).toBeHidden();
  await expect(page.getByText("You're back")).toHaveCount(0);
  await expect(status).toBeVisible();
});
