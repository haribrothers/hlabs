// US-STORE-11 · Run an install as a job, and US-STORE-12 · watch it (main instance, admin, real engine). The PR smoke
// set of D-071: Uptime Kuma and Vaultwarden really install from the sheet, show their steps and end "ready" with
// Open and a Home tile. Runs in the serial project, after the other specs, one at a time. Uninstalling arrives
// with US-APP-12, so a dev-only route takes each app down afterwards.
import { expect, test, type APIRequestContext } from '@playwright/test';
import { MAIN_URL } from './instances';

/** Takes the app down if it's there; a failure here would leave it installed for the next run, so it fails the test. */
async function removeApp(request: APIRequestContext, id: string) {
  const res = await request.post(`${MAIN_URL}/dev/remove-app`, { data: { id } });
  expect(res.ok(), await res.text()).toBe(true);
}

const SMOKE = [
  { id: 'uptime-kuma', name: 'Uptime Kuma' },
  { id: 'vaultwarden', name: 'Vaultwarden' },
];

for (const { id, name } of SMOKE) {
  test(`US-STORE-11 ${name} installs from the sheet and is ready`, async ({ page, request }) => {
    test.setTimeout(6 * 60_000);
    await removeApp(request, id);
    try {
      await page.goto(`/store/app/${id}?install=true`);
      const started = Date.now();
      await page.getByRole('dialog').getByRole('button', { name: 'Install', exact: true }).click();
      // The progress page opens at once (US-STORE-09: within 1 s of the sheet closing).
      await expect(page).toHaveURL(new RegExp(`/store/install/${id}$`));
      expect(Date.now() - started).toBeLessThan(3000);
      const steps = page.getByRole('list', { name: 'Install steps' });
      await expect(steps.getByRole('listitem')).toHaveCount(5);
      await expect(
        page.getByText(`You can leave this page. ${name} appears on your Home screen when it's ready.`),
      ).toBeVisible();

      // Ready: every step done, Open, and on Home.
      await expect(page.getByRole('button', { name: 'Open' })).toBeVisible({ timeout: 5 * 60_000 });
      await expect(page.getByRole('main').getByText(`${name} is ready`)).toBeVisible();
      // The success notification (US-STORE-11).
      await expect(page.getByRole('status').getByText(`${name} is ready`)).toBeVisible();
      await expect(steps.getByText(`Set up ${id}.hlabs.local`)).toBeVisible();
      await page.goto('/');
      await expect(page.getByRole('button', { name: `Open ${name}` })).toBeVisible();
    } finally {
      await removeApp(request, id);
    }
  });
}
