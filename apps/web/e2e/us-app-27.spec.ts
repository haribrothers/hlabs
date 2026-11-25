// US-APP-27 · Make an app public (first-run instance, the pretend Cloudflare; desktop, and PhoneAppPublic as a sheet on
// the phone): set up first or "Make public…", a name already in the domain's DNS, the Public badge in App settings
// and on Home, automatic updates "On while <App> is public", and Make private, after which the address answers 404.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboardingWithTwoFactor } from './onboarding';
import { atPublicAddress, cloudflare, cloudflareState, fakeApp, removeFakeApp } from './public-apps';

test.use({ baseURL: FIRST_RUN_URL });

const ID = 'app27-photos';
const NAME = 'Photos demo';

test.beforeEach(async ({ page, request }) => {
  await finishOnboardingWithTwoFactor(page, request);
  await cloudflare(request, { reset: true });
  await fakeApp(request, ID, NAME, 12471);
});
test.afterEach(async ({ request }) => {
  await cloudflare(request, { reset: true });
  await removeFakeApp(request, ID);
});

test('US-APP-27 without public access set up, Access says to set it up first, with a link there', async ({ page }) => {
  await page.goto(`/?settings=${ID}`);
  const access = page.getByRole('group', { name: 'Access' });
  await expect(access.getByText('Set up public access in Settings › Network first.')).toBeVisible();
  await expect(access.getByRole('button', { name: 'Make public…' })).toHaveCount(0);
  await access.getByRole('link', { name: 'Open Network settings' }).click();
  await expect(page).toHaveURL(/\/settings\/network/);
});

test('US-APP-27 make an app public, see the badge, then make it private', async ({ page, request }) => {
  test.setTimeout(90_000);
  await cloudflare(request, { setUp: true });
  await page.goto(`/?settings=${ID}`);
  const access = page.getByRole('group', { name: 'Access' });
  await expect(access.getByText(`Not public. Only your home network and tailnet can open ${NAME}.`)).toBeVisible();
  await access.getByRole('button', { name: 'Make public…' }).click();

  const dialog = page.getByRole('dialog', { name: `Make ${NAME} public` });
  await expect(dialog).toContainText('.example.com');
  await expect(dialog).toContainText('Anyone on the internet can reach this address. hlabs asks for a login first.');
  await expect(dialog).toContainText(`Automatic updates stay on while ${NAME} is public.`);
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);

  // A name that's already in the domain's DNS (someone's website) is refused.
  const name = dialog.getByRole('textbox', { name: 'Name under example.com' });
  await name.fill('www');
  await dialog.getByRole('button', { name: 'Make public' }).click();
  await expect(dialog.getByText("www.example.com is already in your domain's DNS. Choose another name.")).toBeVisible();
  await name.fill('photos');
  await dialog.getByRole('button', { name: 'Make public' }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole('status').filter({ hasText: `${NAME} is public` })).toBeVisible();

  // The badge, the address, who can get in; automatic updates locked on.
  const row = access.locator('.hl-list-row', { hasText: 'Public on the internet' });
  await expect(row.getByText('Public', { exact: true })).toBeVisible();
  await expect(row.getByRole('link', { name: 'https://photos.example.com' })).toBeVisible();
  await expect(
    row.getByText(/Cloudflare Tunnel · hlabs login with two-factor · since .+ by Hari Prasad/),
  ).toBeVisible();
  const updates = page.getByRole('switch', { name: 'Update automatically' });
  await expect(updates).toHaveAttribute('aria-checked', 'true');
  await expect(updates).toBeDisabled();
  await expect(page.getByText(`On while ${NAME} is public`, { exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Require hlabs login' })).toBeDisabled();
  expect((await cloudflareState(request)).records).toContainEqual({ name: 'photos.example.com', byHlabs: true });
  // The address answers with hlabs's sign-in.
  expect((await atPublicAddress(request, 'photos.example.com').get('/.hlabs/sign-in')).status()).toBe(200);

  // Home's tile says so too.
  await page.goto('/');
  await expect(page.getByRole('button', { name: new RegExp(`${NAME}.*, public$`) })).toBeVisible();

  // Make private: asked first, then the badge goes and the address stops answering.
  await page.goto(`/?settings=${ID}`);
  await access.getByRole('button', { name: 'Make private' }).click();
  const confirm = page.getByRole('alertdialog', { name: `Make ${NAME} private?` });
  await expect(confirm).toContainText('https://photos.example.com stops answering within seconds.');
  await confirm.getByRole('button', { name: 'Make private' }).click();
  await expect(page.getByRole('status').filter({ hasText: `${NAME} is private` })).toBeVisible({ timeout: 15_000 });
  await expect(access.getByRole('button', { name: 'Make public…' })).toBeVisible();
  await expect(access.getByText('Public', { exact: true })).toHaveCount(0);
  expect((await atPublicAddress(request, 'photos.example.com').get('/.hlabs/sign-in')).status()).toBe(404);
  expect((await cloudflareState(request)).records.filter((r) => r.byHlabs)).toEqual([]);
});
