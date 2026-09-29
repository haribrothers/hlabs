// US-STATE-15 · Act on a toast, from the dev gallery's "Uptime Kuma couldn't start" (as its notification carries
// it). apps.start is answered by Playwright: first a failure, then success.
import { expect, test } from '@playwright/test';

test('US-STATE-15 Retry runs the action; a failure updates the toast, success replaces it; later-phase buttons hidden', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/trpc/apps.start**', (route) => {
    calls++;
    const body =
      calls === 1
        ? [
            {
              error: {
                message: 'port',
                code: -32009,
                data: { code: 'CONFLICT', httpStatus: 409, hlabsCode: 'JOB_EXCLUSIVE_RUNNING', detail: null },
              },
            },
          ]
        : [{ result: { data: { ok: true } } }];
    return route.fulfill({
      status: calls === 1 ? 409 : 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/dev/ui');
  await page.getByRole('button', { name: 'Show danger toast' }).click();
  const toast = page.getByRole('alert').filter({ hasText: "Uptime Kuma couldn't start" });
  const retry = toast.getByRole('button', { name: 'Retry' });
  await expect(retry).toBeVisible();
  // View logs opens AppLogs, which ships in phase 2 (D-036).
  await expect(toast.getByRole('link', { name: 'View logs' })).toHaveCount(0);

  await retry.click();
  await expect(toast).toContainText('hlabs is busy. Wait for what it’s doing to finish, then try again.');
  await expect(retry).toBeEnabled();

  await retry.click();
  await expect(page.getByRole('status').filter({ hasText: 'App started' })).toBeVisible();
  await expect(toast).toBeHidden();
  expect(calls).toBe(2);

  // Manage storage waits for Settings › Storage (phase 7).
  await page.getByRole('button', { name: 'Show warning toast' }).click();
  const warning = page.getByRole('status').filter({ hasText: 'Low disk space' });
  await expect(warning).toBeVisible();
  await expect(warning.getByRole('link', { name: 'Manage storage' })).toHaveCount(0);
});
