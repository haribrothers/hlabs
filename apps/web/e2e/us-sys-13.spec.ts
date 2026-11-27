// US-SYS-13 · Free space from unused app images (main instance, admin). The engine is shared with a dev instance and
// other projects, so the spec never removes a real image: the daemon's pretend list (`/dev/fake-images`, D-168)
// stands in for what's reclaimable, and freeing only empties that list.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

test.afterEach(async ({ request }) => {
  await request.post(`${MAIN_URL}/dev/fake-images`, { data: { images: null } });
});

test('US-SYS-13 "Free 6.2 GB" frees the unused images and says how much', async ({ page, request }) => {
  const set = await request.post(`${MAIN_URL}/dev/fake-images`, {
    data: {
      images: [
        { id: 'sha256:e2e-old-kuma', bytes: 4.2e9 },
        { id: 'sha256:e2e-old-immich', bytes: 2e9 },
      ],
    },
  });
  expect(set.ok()).toBe(true);
  await page.goto('/settings/storage');
  const clean = page.getByRole('group', { name: 'Clean up' });
  await expect(clean).toContainText('Left over from updates and uninstalled apps');
  await clean.getByRole('button', { name: 'Free 6.2 GB' }).click();
  await expect(page.getByText('Freed 6.2 GB')).toBeVisible();
  await expect(clean.getByRole('button', { name: 'Nothing to clean up' })).toBeDisabled();
});

test('US-SYS-13 with nothing to free the button says so and is disabled', async ({ page, request }) => {
  await request.post(`${MAIN_URL}/dev/fake-images`, { data: { images: [] } });
  await page.goto('/settings/storage');
  await expect(
    page.getByRole('group', { name: 'Clean up' }).getByRole('button', { name: 'Nothing to clean up' }),
  ).toBeDisabled();
});
