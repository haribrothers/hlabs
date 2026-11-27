// US-SYS-45 · Make the dashboard public (first-run instance, the pretend Cloudflare; desktop and phone): off by default
// with a Dashboard row in Public access; DashboardPublic says what changes and what only works at home and asks for the
// password; it's refused while an admin has no two-factor; once public the row says where, since when and by whom, the
// name is in the domain's DNS (a record hlabs made), and Make private, Turn off all and removing the tunnel take it
// back. The menu-bar app's part is a unit test (apps/tray/test/us-sys-45.test.tsx).
import { expect, test, type Page } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createMember } from './invites';
import { ADMIN, finishOnboardingWithTwoFactor } from './onboarding';
import { DASHBOARD_HOST, setDashboard } from './public-dashboard';
import { cloudflare, cloudflareState, fakeApp, makePublic, removeFakeApp } from './public-apps';

test.use({ baseURL: FIRST_RUN_URL });

const APP = { id: 'sys45-photos', name: 'Photos demo', port: 12451 };

test.beforeEach(async ({ page, request }) => {
  await finishOnboardingWithTwoFactor(page, request);
  await cloudflare(request, { reset: true, setUp: true });
});
test.afterEach(async ({ request }) => {
  await cloudflare(request, { reset: true });
  await removeFakeApp(request, APP.id);
});

const dashboardRow = (page: Page) =>
  page.getByRole('group', { name: 'Public access' }).locator('.hl-list-row', { hasText: 'Dashboard' });

test('US-SYS-45 off by default; Make public… says what changes, asks for the password, then it is public until made private', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await page.goto('/settings/network');
  await expect(page.getByText('Make single apps, or the dashboard itself, reachable from the internet.')).toBeVisible();
  const row = dashboardRow(page);
  await expect(row).toContainText('Not public. Reach it at home or on your tailnet.');

  await row.getByRole('button', { name: 'Make public…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Make the dashboard public' });
  await expect(dialog.getByLabel('Name under example.com')).toHaveValue('hlabs');
  await expect(dialog).toContainText(
    'Anyone on the internet can reach the sign-in page. Everyone signs in with two-factor, and some changes only work at home.',
  );
  const home = dialog.getByRole('list', { name: 'Only at home' });
  for (const item of [
    'Factory reset',
    'Public access and the network',
    'People, roles and invites',
    'Restoring backups',
  ])
    await expect(home.getByText(item)).toBeVisible();
  await expect(dialog.getByRole('list', { name: 'Admins with two-factor' })).toContainText('Two-factor on');
  await expect(dialog.getByRole('switch', { name: "Add Cloudflare's sign-in in front (recommended)" })).toBeChecked();
  await expect(dialog).toContainText('The other admins are told when the dashboard is made public.');
  const confirm = dialog.getByRole('button', { name: 'Make the dashboard public' });
  await expect(confirm).toBeDisabled();

  // A wrong password changes nothing.
  await dialog.getByRole('switch', { name: "Add Cloudflare's sign-in in front (recommended)" }).click();
  await dialog.getByLabel('Password', { exact: true }).fill('not the password');
  await confirm.click();
  await expect(dialog.getByText("That password isn't right. Check it and try again.")).toBeVisible();
  expect((await cloudflareState(request)).records.map((r) => r.name)).not.toContain(DASHBOARD_HOST);

  await dialog.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await confirm.click();
  await expect(page.getByRole('status').filter({ hasText: 'The dashboard is public' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(row).toContainText(/Public at https:\/\/hlabs\.example\.com · since .+ by Hari Prasad/);
  await expect(row.getByText('Public', { exact: true })).toBeVisible();
  expect((await cloudflareState(request)).records).toContainEqual({ name: DASHBOARD_HOST, byHlabs: true });
  await expect(
    page.getByText('Makes the dashboard and every app private. Cloudflare Tunnel stays set up.'),
  ).toBeVisible();

  await row.getByRole('button', { name: 'Make private: Dashboard' }).click();
  const ask = page.getByRole('alertdialog', { name: 'Make the dashboard private?' });
  await expect(ask).toContainText('https://hlabs.example.com stops answering within seconds');
  await ask.getByRole('button', { name: 'Make private' }).click();
  await expect(row).toContainText('Not public. Reach it at home or on your tailnet.', { timeout: 15_000 });
  expect((await cloudflareState(request)).records.map((r) => r.name)).not.toContain(DASHBOARD_HOST);
});

test('US-SYS-45 an admin without two-factor keeps it off, by name; a member without it does not', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await createMember(page, request, FIRST_RUN_URL, { name: 'Ravi' });
  await page.goto('/settings/network');
  await dashboardRow(page).getByRole('button', { name: 'Make public…' }).click();
  let dialog = page.getByRole('dialog', { name: 'Make the dashboard public' });
  await expect(dialog).toContainText("Members without two-factor can't sign in there until they turn it on.");
  await page.keyboard.press('Escape');

  await createMember(page, request, FIRST_RUN_URL, { name: 'Asha', role: 'Admin' });
  await page.goto('/settings/network');
  await dashboardRow(page).getByRole('button', { name: 'Make public…' }).click();
  dialog = page.getByRole('dialog', { name: 'Make the dashboard public' });
  await expect(dialog.getByRole('alert')).toContainText(
    "Asha hasn't turned on two-factor login yet. Every admin needs it before the dashboard can be public.",
  );
  await dialog.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await expect(dialog.getByRole('button', { name: 'Make the dashboard public' })).toBeDisabled();
});

test('US-SYS-45 Turn off all public access and removing the tunnel take the dashboard with the apps', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await fakeApp(request, APP.id, APP.name, APP.port);
  await page.goto('/settings/network');
  await makePublic(page, APP.id, 'photos');
  await setDashboard(request, true);
  await page.reload();

  // Removing Cloudflare Tunnel lists the dashboard with the apps it makes private first.
  await page.getByRole('group', { name: 'Public access' }).getByRole('button', { name: 'Remove…' }).click();
  const remove = page.getByRole('alertdialog', { name: 'Remove Cloudflare Tunnel?' });
  await expect(remove.getByText('hlabs dashboard')).toBeVisible();
  await expect(remove).toContainText('https://hlabs.example.com');
  await expect(remove).toContainText('https://photos.example.com');
  await remove.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: /Turn off all public access/ }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Turn off all public access?' });
  await expect(dialog.getByText('hlabs dashboard')).toBeVisible();
  await expect(dialog).toContainText('https://hlabs.example.com');
  await expect(dialog).toContainText('https://photos.example.com');
  await dialog.getByRole('button', { name: 'Turn off public access' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Public access is off' })).toBeVisible({ timeout: 15_000 });
  await expect(dashboardRow(page)).toContainText('Not public. Reach it at home or on your tailnet.');
  expect((await cloudflareState(request)).records.filter((r) => r.byHlabs)).toEqual([]);
});
