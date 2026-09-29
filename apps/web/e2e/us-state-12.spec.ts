// US-STATE-12 · Progress and errors inside the confirm dialog, seen on Restart engine. The restart call is answered by
// Playwright, so the engine is never restarted.
import { expect, test } from '@playwright/test';

test('US-STATE-12 the dialog is busy while it works, and a failure shows inline with the buttons back', async ({
  page,
}) => {
  await page.goto('/settings/engine');
  const restart = page.getByRole('button', { name: 'Restart engine' });
  const status = page.getByRole('status').filter({ hasText: /^Engine / });
  await expect(status).toBeVisible();
  test.skip((await status.innerText()) !== 'Engine running', 'needs a running engine on this machine');

  let release: () => void = () => {};
  let calls = 0;
  await page.route('**/trpc/settings.engine.restart**', async (route) => {
    calls++;
    if (calls === 2) return route.abort('internetdisconnected');
    await new Promise<void>((r) => (release = r));
    return route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          error: {
            message: 'An engine restart is already running',
            code: -32009,
            data: { code: 'CONFLICT', httpStatus: 409, hlabsCode: 'JOB_EXCLUSIVE_RUNNING', detail: null },
          },
        },
      ]),
    });
  });

  await restart.click();
  const dialog = page.getByRole('alertdialog', { name: 'Restart the container engine?' });
  const go = dialog.getByRole('button', { name: 'Restart', exact: true });
  const cancel = dialog.getByRole('button', { name: 'Cancel' });
  await go.click();
  await expect(go).toBeDisabled();
  await expect(go).toHaveAttribute('aria-busy', 'true');
  await expect(cancel).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.mouse.click(2, 2);
  await expect(dialog).toBeVisible();

  release();
  await expect(dialog.getByRole('alert')).toHaveText(
    'hlabs is busy with something that must finish first. Try again when it’s done.',
  );
  await expect(dialog).not.toContainText('already running');
  await expect(go).toBeEnabled();
  await expect(cancel).toBeEnabled();

  await go.click();
  await expect(dialog.getByRole('alert')).toHaveText(
    "Can't reach hlabs right now. Check your connection and try again.",
  );
  await cancel.click();
  await expect(dialog).toBeHidden();
  await expect(status).toHaveText('Engine running');
});
