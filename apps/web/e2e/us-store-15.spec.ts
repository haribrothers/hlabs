// US-STORE-15 · See and apply available updates (main instance, admin): a stand-in for a store app at an older version
// is listed with "<old> → <new> · released …", What's new opens its notes, "Update all (N)" sits in the header and
// the footer leads to Settings › Updates. Updating itself (jobs, progress, Recently updated) is covered by the daemon
// and dashboard tests: here it would pull real images.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

// One stand-in per project (they run at the same time), each a store app with a release.
const idFor = (project: string) => (project === 'phone' ? 'open-webui' : 'n8n');
const nameFor = (project: string) => (project === 'phone' ? 'Open WebUI' : 'n8n');

test.afterEach(async ({ request }, info) => {
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: idFor(info.project.name), remove: true } });
});

test('US-STORE-15 an app with a newer version: its versions, What’s new, Update all and the footer', async ({
  page,
  request,
}, info) => {
  const id = idFor(info.project.name);
  const added = await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id, behind: '0.0.1' } });
  expect(added.status()).toBe(200);

  await page.goto('/store/updates');
  const row = page
    .getByRole('list', { name: 'Updates' })
    .getByRole('listitem')
    .filter({ hasText: `${nameFor(info.project.name)}0.0.1 →` });
  await expect(row).toContainText(/0\.0\.1 → \S+ · released (today|yesterday|\d+ \w+ ago)/);
  await row.getByRole('button', { name: "What's new" }).click();
  await expect(row.getByRole('button', { name: 'Hide notes' })).toHaveAttribute('aria-expanded', 'true');
  await expect(row.getByRole('region', { name: /^What's new in / })).toBeVisible();
  if (process.env.HLABS_SHOTS)
    await page.screenshot({ path: `${process.env.HLABS_SHOTS}/store-updates-${info.project.name}.png` });
  await expect(page.getByRole('button', { name: /^Update all \(\d+\)$/ })).toBeVisible();
  // The App Store's badge counts it (US-HOME-05).
  if (info.project.name === 'desktop')
    await expect(page.getByRole('navigation', { name: 'Dock' }).locator('.hl-dock-badge')).toHaveText(/^[1-9]/);

  await page.getByRole('link', { name: 'Settings › Updates' }).click();
  await expect(page).toHaveURL(/\/settings\/updates$/);
});
