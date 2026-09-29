// US-STATE-17 · Errors in plain words: a raw daemon error never reaches the screen. Restart engine's call is
// answered by Playwright with raw text and a code the dashboard doesn't know.
import { expect, test } from '@playwright/test';

const RAW = 'Error: exec /usr/local/bin/colima: exit status 1 at /var/lib/docker/containers/3f9a1c2b4d5e';

test('US-STATE-17 an unknown error shows the generic copy inline, never the raw message', async ({ page }) => {
  await page.goto('/settings/engine');
  const status = page.getByRole('status').filter({ hasText: /^Engine / });
  await expect(status).toBeVisible();
  test.skip((await status.innerText()) !== 'Engine running', 'needs a running engine on this machine');
  await page.route('**/trpc/settings.engine.restart**', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          error: {
            message: RAW,
            code: -32603,
            data: {
              code: 'INTERNAL_SERVER_ERROR',
              httpStatus: 500,
              hlabsCode: 'SOMETHING_NEW',
              detail: null,
              stack: RAW,
            },
          },
        },
      ]),
    }),
  );

  await page.getByRole('button', { name: 'Restart engine' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Restart the container engine?' });
  await dialog.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'Something went wrong. Try again. If it keeps happening, check the logs in Settings › Advanced.',
  );
  await expect(page.locator('body')).not.toContainText('colima');
  await expect(page.locator('body')).not.toContainText('/var/lib');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});
