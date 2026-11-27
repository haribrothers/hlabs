// US-SYS-43 · Set up a way to make apps public (first-run instance, the pretend Cloudflare; desktop and phone):
// Sign in to Cloudflare in a new tab, the setup's steps, the API-token fallback, "What hlabs connects to", and
// Remove… making every public app private first and deleting only the DNS records hlabs made.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboardingWithTwoFactor } from './onboarding';
import { cloudflare, cloudflareState, fakeApp, GOOD_TOKEN, makePublic, removeFakeApp } from './public-apps';

test.use({ baseURL: FIRST_RUN_URL });

const ID = 'sys43-photos';

test.beforeEach(async ({ page, request }) => {
  await finishOnboardingWithTwoFactor(page, request);
  await cloudflare(request, { reset: true, signInUrl: 'about:blank#cloudflare-sign-in' });
});
test.afterEach(async ({ request }) => {
  await cloudflare(request, { reset: true });
  await removeFakeApp(request, ID);
});

test('US-SYS-43 Sign in to Cloudflare: the link in a new tab, waiting, the steps, then set up', async ({
  page,
  context,
  request,
}) => {
  await page.goto('/settings/network');
  const group = page.getByRole('group', { name: 'Public access' });
  await expect(page.getByText('Make single apps, or the dashboard itself, reachable from the internet.')).toBeVisible();
  await expect(
    group.getByText(
      'Public apps go through Cloudflare Tunnel, at names under a domain of yours. Your tailnet stays private.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('group', { name: 'Public apps' }).getByText('No apps are public.')).toBeVisible();
  await group.getByRole('button', { name: 'Set up Cloudflare Tunnel…' }).click();

  const dialog = page.getByRole('dialog', { name: /Set up Cloudflare Tunnel/ });
  await expect(dialog).toContainText('A domain of yours, added to your Cloudflare account');
  await expect(dialog.getByRole('link', { name: /How to add a domain to Cloudflare/ })).toHaveAttribute(
    'href',
    /\/help\/remote-access\/make-an-app-public\/#add-your-domain-to-cloudflare$/,
  );
  await expect(dialog).toContainText('Cloudflare will see the traffic to your public apps.');
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);

  const [tab] = await Promise.all([
    context.waitForEvent('page'),
    dialog.getByRole('button', { name: /Sign in to Cloudflare/ }).click(),
  ]);
  await expect.poll(() => tab.url()).toBe('about:blank#cloudflare-sign-in');
  await tab.close();
  await expect(dialog.getByText('Waiting for you in Cloudflare…')).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Open Cloudflare again/ })).toHaveAttribute(
    'href',
    'about:blank#cloudflare-sign-in',
  );

  // The admin approves hlabs for example.com in Cloudflare's tab.
  await cloudflare(request, { approve: true });
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Cloudflare Tunnel is set up' })).toBeVisible();
  await expect(group.getByText('example.com', { exact: true })).toBeVisible();
  await expect(group.getByText('Connected')).toBeVisible();
  await expect(group.getByRole('button', { name: 'Remove…' })).toBeVisible();

  // What hlabs connects to lists Cloudflare while the tunnel is set up.
  await page.goto('/settings/advanced');
  await page.getByRole('button', { name: 'View What hlabs connects to' }).click();
  const connections = page.getByRole('dialog', { name: 'What hlabs connects to' });
  await expect(connections).toContainText('api.cloudflare.com');
  await expect(connections).toContainText('Carries the apps you make public, through Cloudflare Tunnel');
});

test('US-SYS-43 Use an API token instead: what it needs, a refused token, then set up', async ({ page }) => {
  await page.goto('/settings/network');
  await page.getByRole('button', { name: 'Set up Cloudflare Tunnel…' }).click();
  const dialog = page.getByRole('dialog', { name: /Set up Cloudflare Tunnel/ });
  await dialog.getByRole('button', { name: 'Use an API token instead' }).click();
  await expect(dialog.getByText('Zone · DNS · Edit')).toBeVisible();
  await expect(dialog.getByText('Account · Cloudflare Tunnel · Edit')).toBeVisible();
  await dialog.getByLabel('Domain').fill('example.com');
  await dialog.getByLabel('API token').fill('not-a-token-cloudflare-knows');
  await dialog.getByRole('button', { name: 'Check and set up' }).click();
  await expect(dialog.getByText(/Cloudflare didn't accept that token/)).toBeVisible();
  await dialog.getByLabel('API token').fill(GOOD_TOKEN);
  await dialog.getByRole('button', { name: 'Check and set up' }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole('group', { name: 'Public access' }).getByText('Connected')).toBeVisible();
});

test('US-SYS-43 Remove… makes public apps private first, then deletes the tunnel and only its own DNS records', async ({
  page,
  request,
}) => {
  await cloudflare(request, { setUp: true });
  await fakeApp(request, ID, 'Photos demo', 12431);
  await page.goto('/settings/network');
  await makePublic(page, ID, 'photos');
  expect((await cloudflareState(request)).records).toContainEqual({ name: 'photos.example.com', byHlabs: true });

  await page.reload();
  await page.getByRole('group', { name: 'Public access' }).getByRole('button', { name: 'Remove…' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Remove Cloudflare Tunnel?' });
  await expect(dialog).toContainText('hlabs makes these apps private first');
  await expect(dialog).toContainText('Photos demo');
  await expect(dialog).toContainText('https://photos.example.com');
  await expect(dialog).toContainText("Your domain's other DNS records, like a website or email, aren't touched.");
  await dialog.getByRole('button', { name: 'Make private and remove' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Cloudflare Tunnel is removed' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('button', { name: 'Set up Cloudflare Tunnel…' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Public apps' }).getByText('No apps are public.')).toBeVisible();
  const zone = await cloudflareState(request);
  expect(zone.tunnels).toEqual([]);
  expect(zone.records.filter((r) => r.byHlabs)).toEqual([]);
  // Everyone else's records are still there.
  expect(zone.records.map((r) => r.name).sort()).toEqual(['example.com', 'mail.example.com', 'www.example.com']);
});
