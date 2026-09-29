// US-SYS-18 · Restart the container engine (first-run instance: restarts are pretended there,
// HLABS_DEV_NO_ENGINE_CONTROL, so the real engine is never restarted).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-SYS-18 Restart engine asks first, runs as a job and comes back', async ({ page, request }) => {
  await finishOnboarding(page, request);
  await page.goto('/settings/engine');
  const restart = page.getByRole('button', { name: 'Restart engine' });
  const status = page.getByRole('status').filter({ hasText: /^Engine / });
  await expect(status).toBeVisible();
  test.skip((await status.innerText()) !== 'Engine running', 'needs a running engine on this machine');

  await restart.click();
  const dialog = page.getByRole('alertdialog', { name: 'Restart the container engine?' });
  await expect(dialog.getByText('All apps stop for about a minute.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Restart' }).click();
  await expect(dialog).toBeHidden();
  await expect(restart).toBeVisible({ timeout: 15_000 });
  await expect(status).toHaveText('Engine running');
});

test('US-SYS-18 the restart progress sits inside the engine row', async ({ page, request }) => {
  await finishOnboarding(page, request);
  // A restart in progress, as jobs.list would report it (the call may be batched with others).
  await page.route('**/trpc/**jobs.list**', async (route) => {
    const response = await route.fetch();
    const paths = decodeURIComponent(new URL(route.request().url()).pathname.replace('/trpc/', '')).split(',');
    const body = (await response.json()) as Array<{ result?: { data: unknown } }>;
    const i = paths.indexOf('jobs.list');
    body[i] = {
      result: {
        data: {
          items: [
            {
              id: 'j1',
              kind: 'engine_restart',
              target: null,
              state: 'running',
              progress: 40,
              message: null,
              hlabsCode: null,
              createdAt: 1,
              finishedAt: null,
            },
          ],
        },
      },
    };
    await route.fulfill({ response, json: body });
  });
  await page.goto('/settings/engine');
  const bar = page.getByRole('progressbar', { name: 'Restarting the engine' });
  await expect(bar).toBeVisible();
  const row = page.locator('.hl-list-row').filter({ has: bar });
  const [b, r] = [(await bar.boundingBox())!, (await row.boundingBox())!];
  // Inside the row's padding on the right, and centred on the row.
  expect(b.x + b.width).toBeLessThanOrEqual(r.x + r.width - 16);
  expect(Math.abs(b.y + b.height / 2 - (r.y + r.height / 2))).toBeLessThan(4);
});
