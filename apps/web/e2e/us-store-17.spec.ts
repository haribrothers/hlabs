// US-STORE-17 · An update that rolled back (main instance, admin, desktop): the banner on the app's details page, View
// log opening the logs at that moment, and Dismiss for good. A stand-in for Mealie and /dev/rolled-back leave what the
// update job leaves; the update itself, going back and the old digests running again are covered by the daemon tests.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'mealie';

// A skipped run (the phone project) must leave the stand-in alone: the desktop run may be using it.
test.afterEach(async ({ request }, info) => {
  if (info.status === 'skipped') return;
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
});

test("US-STORE-17 an update that didn't start shows on the app's page, with View log and Dismiss", async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name === 'phone', 'One run is enough: the banner is the same on a phone');
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name: 'Mealie' } });
  const rolledBack = await request.post(`${MAIN_URL}/dev/rolled-back`, {
    data: { id: ID, name: 'Mealie', fromVersion: '2.1.0', toVersion: '2.2.0' },
  });
  expect(`${rolledBack.status()} ${await rolledBack.text()}`).toMatch(/^200 /);

  await page.goto(`/store/app/${ID}`);
  const banner = page.getByRole('status').filter({ hasText: 'rolled it back' });
  await expect(banner.getByText("Mealie's update didn't start, so hlabs rolled it back")).toBeVisible();
  await expect(banner.getByText("It's running 2.1.0 again.")).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Try again' })).toBeVisible();

  // View log: the logs at the failed update's time, not following.
  await banner.getByRole('link', { name: 'View log' }).click();
  await expect(page).toHaveURL(new RegExp(`/apps/${ID}/logs\\?at=\\d+`));
  await expect(page.getByRole('heading', { name: 'Mealie logs' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Following' })).toHaveAttribute('aria-pressed', 'false');

  // Dismissed, it doesn't come back.
  await page.goto(`/store/app/${ID}`);
  await banner.getByRole('button', { name: 'Dismiss' }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Mealie' })).toBeVisible();
  await expect(banner).toHaveCount(0);
});
