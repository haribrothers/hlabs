// US-STORE-01 · Browse the store home (main instance, signed in as an admin). The App Store joins the Dock when phase
// 2 ships (D-036), so these specs open /store directly. Installing arrives with US-STORE-11: a dev-only stand-in
// marks a store app installing, then installed.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

/** One store app per project, since desktop and phone run at the same time. */
const appFor = (project: string) =>
  project === 'phone' ? { id: 'vaultwarden', name: 'Vaultwarden' } : { id: 'uptime-kuma', name: 'Uptime Kuma' };

test('US-STORE-01 featured apps and rows; "See all" lists a row; a card opens its details', async ({ page }) => {
  await page.goto('/store');
  const featured = page.getByRole('region', { name: 'Featured' });
  await expect(featured.getByRole('link', { name: 'Immich', exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Popular with families' }).getByRole('listitem')).toHaveCount(3);

  await page.getByRole('link', { name: 'See all Popular with families' }).click();
  await expect(page).toHaveURL(/\/store\/collection\/popular$/);
  await expect(page.getByRole('heading', { name: 'Popular with families' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Popular with families' }).getByRole('listitem')).toHaveCount(3);

  await page
    .getByRole('list', { name: 'Popular with families' })
    .getByRole('link', { name: 'Vaultwarden', exact: true })
    .click();
  await expect(page).toHaveURL(/\/store\/app\/vaultwarden$/);
});

test('US-STORE-01 Install goes to the details first; the button follows install state live', async ({
  page,
  request,
}, info) => {
  const { id, name } = appFor(info.project.name);
  await page.goto('/store');
  const row = page.getByRole('region', { name: 'Popular with families' });
  await expect(row.getByRole('link', { name: `Install ${name}` })).toHaveAttribute('href', `/store/app/${id}`);

  try {
    await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id, state: 'installing', progress: 42 } });
    await expect(row.getByRole('button', { name: 'Installing… 42%' })).toBeVisible({ timeout: 5000 });
    await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id, state: 'running' } });
    await expect(row.getByRole('button', { name: `Open ${name}` })).toBeVisible({ timeout: 5000 });
  } finally {
    await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id, remove: true } });
  }
});

test('US-STORE-01 "Back to Home" closes the store on desktop', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'The phone uses the tab bar');
  await page.goto('/store');
  await page.getByRole('link', { name: 'Back to Home' }).click();
  await expect(page).toHaveURL(`${MAIN_URL}/`);
});
