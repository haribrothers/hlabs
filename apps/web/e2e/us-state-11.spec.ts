// US-STATE-11 · Confirm an action with the shared dialog, seen on Restart engine (only ever cancelled here).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-STATE-11 the confirm dialog asks, traps focus, closes without acting and gives focus back', async ({
  page,
}, testInfo) => {
  await page.goto('/settings/engine');
  const restart = page.getByRole('button', { name: 'Restart engine' });
  const status = page.getByRole('status').filter({ hasText: /^Engine / });
  await expect(status).toBeVisible();
  test.skip((await status.innerText()) !== 'Engine running', 'needs a running engine on this machine');

  const dialog = page.getByRole('alertdialog', { name: 'Restart the container engine?' });
  const confirmButton = dialog.getByRole('button', { name: 'Restart', exact: true });
  const cancel = dialog.getByRole('button', { name: 'Cancel' });

  await restart.click();
  await expect(dialog).toHaveAccessibleDescription('All apps stop for about a minute.');
  await expect(confirmButton).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(confirmButton).toBeFocused();
  expect((await new AxeBuilder({ page }).include('[role="alertdialog"]').analyze()).violations).toEqual([]);

  const phone = testInfo.project.name === 'phone';
  const [dialogBox, confirmBox, cancelBox, viewport] = [
    await dialog.boundingBox(),
    await confirmButton.boundingBox(),
    await cancel.boundingBox(),
    page.viewportSize(),
  ];
  if (phone) {
    // A bottom sheet: full width, flush with the bottom, the verb above Cancel, both full-width.
    expect(dialogBox!.width).toBeCloseTo(viewport!.width, 0);
    expect(dialogBox!.y + dialogBox!.height).toBeCloseTo(viewport!.height, 0);
    expect(confirmBox!.y).toBeLessThan(cancelBox!.y);
    expect(confirmBox!.width).toBeCloseTo(cancelBox!.width, 0);
  } else {
    expect(confirmBox!.x).toBeGreaterThan(cancelBox!.x);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(restart).toBeFocused();

  await restart.click();
  await cancel.click();
  await expect(dialog).toBeHidden();
  await expect(restart).toBeFocused();

  await restart.click();
  await expect(confirmButton).toBeFocused();
  // Radix starts listening for outside clicks a tick after opening; no person clicks that fast.
  await expect(async () => {
    await page.mouse.click(2, 2);
    await expect(dialog).toBeHidden({ timeout: 500 });
  }).toPass();
  await expect(restart).toBeFocused();
  await expect(status).toHaveText('Engine running');
});
