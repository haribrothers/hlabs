// US-ONB-19 · Pick starter apps (first-run instance, phase 2 previewed, D-092). One real install: Uptime Kuma, the
// smallest, under the e2e compose prefix (D-090); the spec waits for it, then uninstalls it with its data.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createAdminInUi, skipTwoFactor } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

const STARTERS = [
  'Jellyfin',
  'Immich',
  'Nextcloud',
  'Home Assistant',
  'Vaultwarden',
  'Paperless-ngx',
  'Uptime Kuma',
  'Open WebUI',
];

/** tRPC as the signed-in admin, from the page (mutations carry the CSRF header). */
async function trpc(page: Page, path: string, input?: unknown, mutation = false) {
  return page.evaluate(
    async ({ path, input, mutation }) => {
      const me = (await (await fetch('/trpc/auth.me')).json()) as { result?: { data: { csrfToken: string } } };
      const res = mutation
        ? await fetch(`/trpc/${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-hlabs-csrf': me.result?.data.csrfToken ?? '' },
            body: JSON.stringify(input),
          })
        : await fetch(`/trpc/${path}${input ? `?input=${encodeURIComponent(JSON.stringify(input))}` : ''}`);
      return (await res.json()) as { result?: { data: Record<string, unknown> }; error?: unknown };
    },
    { path, input, mutation },
  );
}
const kumaState = async (page: Page) =>
  ((await trpc(page, 'apps.get', { appId: 'uptime-kuma' })).result?.data.state as string | undefined) ?? null;

// The real install is taken down again whatever happened: once it has settled, uninstalled with its data.
test.afterEach(async ({ page }, info) => {
  if (info.status === 'skipped') return;
  test.setTimeout(240_000);
  await expect.poll(() => kumaState(page), { timeout: 180_000 }).not.toBe('installing');
  if ((await kumaState(page)) === null) return;
  await trpc(page, 'apps.uninstall', { appId: 'uptime-kuma', keepData: false }, true);
  await expect.poll(() => kumaState(page), { timeout: 60_000 }).toBeNull();
});

test('US-ONB-19 pick starter apps: eight tiles, none picked; Install and finish installs them', async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name === 'first-run-phone', 'One real install is enough');
  test.setTimeout(240_000);
  await createAdminInUi(page, request);
  await skipTwoFactor(page);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/apps`);
  await expect(page.getByRole('navigation', { name: 'Setup progress' })).toContainText('Step 5 of 5');
  await expect(page.getByRole('heading', { level: 1, name: 'Pick a few apps to start' })).toBeFocused();
  await expect(page.getByText("They'll install in the background. Hundreds more are in the App Store.")).toBeVisible();
  const tiles = page.getByRole('list', { name: 'Starter apps' }).getByRole('button');
  await expect(tiles).toHaveCount(8);
  for (const [i, name] of STARTERS.entries()) {
    await expect(tiles.nth(i)).toHaveAccessibleName(new RegExp(`^${name}`));
    await expect(tiles.nth(i)).toHaveAttribute('aria-pressed', 'false');
  }
  const install = page.getByRole('button', { name: /^Install and finish/ });
  await expect(install).toBeDisabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Space toggles a tile.
  const kuma = tiles.nth(6);
  await kuma.focus();
  await page.keyboard.press('Space');
  await expect(kuma).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1 app selected')).toBeVisible();
  await expect(install).toHaveAccessibleName('Install and finish 1');

  // The finish screen opens without waiting for the install.
  await install.click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/done`);
  await expect(page.getByText('Your apps are installing.', { exact: false })).toBeVisible();
  const summary = page.getByRole('group', { name: 'What was set up' });
  await expect(summary).toContainText('Installing 1 app');
  await expect(summary).toContainText('Uptime Kuma');

  await page.getByRole('button', { name: 'Open dashboard' }).click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/`);
  await expect.poll(() => kumaState(page), { timeout: 180_000 }).toBe('running');
});
