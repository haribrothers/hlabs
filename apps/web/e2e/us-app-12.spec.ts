// US-APP-12 · Uninstall runs and cleans up (main instance, admin, real engine). Gitea really installs, then is
// uninstalled from App settings keeping its data: Home shows it going, then it's gone, and a toast says so. Runs in
// the serial project; Gitea is used by no other spec there, since their files run side by side.
import { expect, test, type APIRequestContext } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'gitea';
const NAME = 'Gitea';

async function removeApp(request: APIRequestContext) {
  const res = await request.post(`${MAIN_URL}/dev/remove-app`, { data: { id: ID } });
  expect(res.ok(), await res.text()).toBe(true);
}

test('US-APP-12 uninstalling from App settings returns Home, where the app goes, and says it was uninstalled', async ({
  page,
  request,
}) => {
  test.setTimeout(6 * 60_000);
  await removeApp(request);
  try {
    await page.goto(`/store/app/${ID}?install=true`);
    await page.getByRole('dialog').getByRole('button', { name: 'Install', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open' })).toBeVisible({ timeout: 5 * 60_000 });

    await page.goto(`/apps/${ID}/settings`);
    await page.getByRole('button', { name: 'Uninstall…' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Uninstall', exact: true }).click();
    await expect(page).toHaveURL(`${MAIN_URL}/`);
    await expect(page.getByRole('status').getByText(`${NAME} was uninstalled`)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: new RegExp(`^(Open )?${NAME}`) })).toHaveCount(0);
  } finally {
    await removeApp(request);
  }
});
