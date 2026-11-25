// US-SYS-48 · Add Cloudflare's sign-in in front of the dashboard (first-run instance, the pretend Cloudflare; desktop
// and phone): while making the dashboard public or once it is, with the email addresses allowed; the row says how many;
// Change… changes the list in place and Remove takes it away; a Cloudflare sign-in that can't manage Access asks for
// an API token (only `fake-cloudflare-access-token-0123456789` will do); making the dashboard private deletes the
// Access application hlabs made. Checked against a real Cloudflare by hand (Q-25).
import { expect, test, type Page } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboardingWithTwoFactor } from './onboarding';
import { cloudflare, cloudflareState } from './public-apps';
import { DASHBOARD_HOST, setDashboard } from './public-dashboard';

test.use({ baseURL: FIRST_RUN_URL });

const ACCESS_TOKEN = 'fake-cloudflare-access-token-0123456789';

test.beforeEach(async ({ page, request }) => {
  await finishOnboardingWithTwoFactor(page, request);
  await cloudflare(request, { reset: true, setUp: true });
});
test.afterEach(async ({ request }) => {
  await cloudflare(request, { reset: true });
});

const dashboardRow = (page: Page) =>
  page.getByRole('group', { name: 'Public access' }).locator('.hl-list-row', { hasText: 'Dashboard' });

async function addEmails(dialog: ReturnType<Page['getByRole']>, emails: string[]) {
  const field = dialog.getByRole('textbox', { name: 'Email addresses allowed' });
  for (const email of emails) {
    await field.fill(email);
    await field.press('Enter');
    await expect(dialog.getByRole('button', { name: `Remove ${email}` })).toBeVisible();
  }
}

test('US-SYS-48 added while making the dashboard public, for its name, with the addresses allowed', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await page.goto('/settings/network');
  await dashboardRow(page).getByRole('button', { name: 'Make public…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Make the dashboard public' });
  await expect(dialog).toContainText(
    "Cloudflare asks for a code sent to an email address on your list before showing hlabs's sign-in. It's free for up to 50 people.",
  );
  await addEmails(dialog, ['hari@example.com', 'asha@example.com']);
  await dialog.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await dialog.getByRole('button', { name: 'Make the dashboard public' }).click();
  await expect(dashboardRow(page)).toContainText("Cloudflare's sign-in in front · 2 email addresses", {
    timeout: 20_000,
  });
  expect((await cloudflareState(request)).accessApps).toEqual([
    { hostname: DASHBOARD_HOST, emails: ['hari@example.com', 'asha@example.com'] },
  ]);
});

test('US-SYS-48 added once public, changed in place, then removed; making it private deletes it', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await setDashboard(request, true);
  await page.goto('/settings/network');
  await dashboardRow(page).getByRole('button', { name: "Add Cloudflare's sign-in…" }).click();
  let dialog = page.getByRole('dialog', { name: "Add Cloudflare's sign-in in front" });
  await expect(dialog).toContainText('Press Return after each one. Only admins see this list.');
  await expect(dialog).toContainText(
    'hlabs makes this in Cloudflare Zero Trust for hlabs.example.com and removes it when the dashboard is private.',
  );
  await addEmails(dialog, ['hari@example.com', 'asha@example.com', 'ravi@example.com']);
  await dialog.getByRole('button', { name: "Add Cloudflare's sign-in" }).click();
  await expect(
    page.getByRole('status').filter({ hasText: "Cloudflare's sign-in is in front of the dashboard" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(dashboardRow(page)).toContainText("Cloudflare's sign-in in front · 3 email addresses");
  expect((await cloudflareState(request)).accessApps).toHaveLength(1);

  await dashboardRow(page).getByRole('button', { name: 'Change…' }).click();
  dialog = page.getByRole('dialog', { name: "Change Cloudflare's sign-in" });
  await dialog.getByRole('button', { name: 'Remove ravi@example.com' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dashboardRow(page)).toContainText("Cloudflare's sign-in in front · 2 email addresses", {
    timeout: 15_000,
  });
  expect((await cloudflareState(request)).accessApps).toEqual([
    { hostname: DASHBOARD_HOST, emails: ['hari@example.com', 'asha@example.com'] },
  ]);

  await dashboardRow(page).getByRole('button', { name: 'Change…' }).click();
  await page
    .getByRole('dialog', { name: "Change Cloudflare's sign-in" })
    .getByRole('button', { name: 'Remove', exact: true })
    .click();
  const ask = page.getByRole('alertdialog', { name: "Remove Cloudflare's sign-in?" });
  await ask.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(dashboardRow(page)).not.toContainText("Cloudflare's sign-in in front ·", { timeout: 15_000 });
  expect((await cloudflareState(request)).accessApps).toEqual([]);

  // On again, then the dashboard made private: the Access application goes with it.
  await dashboardRow(page).getByRole('button', { name: "Add Cloudflare's sign-in…" }).click();
  dialog = page.getByRole('dialog', { name: "Add Cloudflare's sign-in in front" });
  await addEmails(dialog, ['hari@example.com']);
  await dialog.getByRole('button', { name: "Add Cloudflare's sign-in" }).click();
  await expect(dashboardRow(page)).toContainText("Cloudflare's sign-in in front · 1 email address", {
    timeout: 15_000,
  });
  await setDashboard(request, false);
  expect((await cloudflareState(request)).accessApps).toEqual([]);
});

test('US-SYS-48 a Cloudflare sign-in that can’t manage Access asks for an API token, then works with one', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await setDashboard(request, true);
  await cloudflare(request, { accessDenied: true });
  await page.goto('/settings/network');
  await dashboardRow(page).getByRole('button', { name: "Add Cloudflare's sign-in…" }).click();
  const dialog = page.getByRole('dialog', { name: "Add Cloudflare's sign-in in front" });
  await addEmails(dialog, ['hari@example.com']);
  await dialog.getByRole('button', { name: "Add Cloudflare's sign-in" }).click();
  await expect(dialog.getByRole('alert').first()).toContainText(
    "Your Cloudflare sign-in can't manage Cloudflare Access. Add an API token with Account · Access: Apps and Policies · Edit.",
  );
  await expect(dialog).toContainText("Kept in this computer's keychain with your other Cloudflare sign-in.");
  expect((await cloudflareState(request)).accessApps).toEqual([]);

  // A token that can't either: still asked.
  await dialog.getByLabel('API token').fill('another-token-that-cannot-0123456789');
  await dialog.getByRole('button', { name: "Add Cloudflare's sign-in" }).click();
  await expect(dialog.getByText(/Your Cloudflare sign-in can't manage Cloudflare Access/).first()).toBeVisible();
  expect((await cloudflareState(request)).accessApps).toEqual([]);

  await dialog.getByLabel('API token').fill(ACCESS_TOKEN);
  await dialog.getByRole('button', { name: "Add Cloudflare's sign-in" }).click();
  await expect(dashboardRow(page)).toContainText("Cloudflare's sign-in in front · 1 email address", {
    timeout: 15_000,
  });
  expect((await cloudflareState(request)).accessApps).toEqual([
    { hostname: DASHBOARD_HOST, emails: ['hari@example.com'] },
  ]);
});
