// US-SYS-44 · See and stop everything that's public (first-run instance, the pretend Cloudflare; desktop and phone):
// the Public apps list with each app's address, who can get in, since when and by whom; "Turn off all public access"
// makes every app private in one job while the tunnel stays set up. The menu-bar app's part is a unit test
// (apps/tray/test/us-sys-44.test.tsx).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboardingWithTwoFactor } from './onboarding';
import { atPublicAddress, cloudflare, cloudflareState, fakeApp, makePublic, removeFakeApp } from './public-apps';

test.use({ baseURL: FIRST_RUN_URL });

const APPS = [
  { id: 'sys44-photos', name: 'Photos demo', port: 12441, label: 'photos' },
  { id: 'sys44-notes', name: 'Notes demo', port: 12442, label: 'notes' },
];

test.beforeEach(async ({ page, request }) => {
  await finishOnboardingWithTwoFactor(page, request);
  await cloudflare(request, { reset: true, setUp: true });
  for (const a of APPS) await fakeApp(request, a.id, a.name, a.port);
});
test.afterEach(async ({ request }) => {
  await cloudflare(request, { reset: true });
  for (const a of APPS) await removeFakeApp(request, a.id);
});

test('US-SYS-44 lists every public app, then "Turn off all public access" makes them all private', async ({
  page,
  request,
}) => {
  await page.goto('/settings/network');
  await makePublic(page, APPS[0]!.id, 'photos');
  await makePublic(page, APPS[1]!.id, 'notes');
  await page.reload();

  const list = page.getByRole('group', { name: 'Public apps' });
  const photos = list.locator('.hl-list-row', { hasText: 'Photos demo' });
  await expect(photos.getByText('Public', { exact: true })).toBeVisible();
  await expect(photos.getByText('https://photos.example.com')).toBeVisible();
  await expect(photos.getByText(/hlabs login with two-factor · since .+ by Hari Prasad/)).toBeVisible();
  await expect(photos.getByRole('button', { name: 'Visits: Photos demo' })).toBeVisible();
  await expect(photos.getByRole('button', { name: 'Make private: Photos demo' })).toBeVisible();
  await expect(list.locator('.hl-list-row', { hasText: 'Notes demo' })).toContainText('https://notes.example.com');

  // Visits opens over the page.
  await photos.getByRole('button', { name: 'Visits: Photos demo' }).click();
  await expect(page.getByRole('heading', { name: 'Visits to Photos demo' })).toBeVisible();
  await page.goBack();

  await page.getByRole('button', { name: /Turn off all public access/ }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Turn off all public access?' });
  await expect(dialog).toContainText('https://photos.example.com');
  await expect(dialog).toContainText('https://notes.example.com');
  await expect(dialog).toContainText('The other admins get a notification, and the audit log records it.');
  await dialog.getByRole('button', { name: 'Turn off public access' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Public access is off' })).toBeVisible({ timeout: 15_000 });
  await expect(list.getByText('No apps are public.')).toBeVisible();

  // The tunnel stays set up; the addresses stop answering and their records are gone.
  await expect(page.getByRole('group', { name: 'Public access' }).getByText('Connected')).toBeVisible();
  expect((await cloudflareState(request)).tunnels).toHaveLength(1);
  expect((await cloudflareState(request)).records.filter((r) => r.byHlabs)).toEqual([]);
  expect((await atPublicAddress(request, 'photos.example.com').get('/.hlabs/sign-in')).status()).toBe(404);
});
