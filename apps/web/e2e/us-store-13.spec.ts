// US-STORE-13 · Understand why an install failed, and US-STORE-14 · retry or remove it (main instance, admin). A
// dev-only stand-in puts Immich in install_failed with a reason, as a failed job leaves it; the real removal runs.
// In the store-install project, after the other specs.
import { expect, test, type APIRequestContext } from '@playwright/test';
import { MAIN_URL } from './instances';

const failWith = (request: APIRequestContext, stateDetail: Record<string, unknown>) =>
  request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: 'immich', state: 'install_failed', stateDetail } });

test.afterEach(async ({ request }) => {
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: 'immich', remove: true } });
});

test('US-STORE-13 a failed install says which step failed, why, and offers a different port', async ({
  page,
  request,
}) => {
  await failWith(request, { code: 'APP_PORT_IN_USE', port: 2283, step: 'start' });
  // Home's tile shows the error and opens the page (US-STORE-14).
  await page.goto('/');
  await page.getByRole('button', { name: 'Immich, error' }).click();
  await expect(page).toHaveURL(/\/store\/install\/immich$/);

  await expect(page.getByText('Install failed')).toBeVisible();
  await expect(page.getByText('Nothing else was changed')).toBeVisible();
  const failed = page.getByRole('listitem').filter({ hasText: 'Failed' });
  await expect(failed).toContainText('Starting containers');
  await expect(failed).toContainText('Port 2283 is already used by another program on this computer.');

  await failed.getByRole('button', { name: 'Use a different port' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox', { name: 'Port' })).toHaveValue(/^12\d{3}$/);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

test('US-STORE-14 "Remove partial install" asks, removes and the store offers Install again', async ({
  page,
  request,
}) => {
  await failWith(request, { code: 'APP_HEALTH_TIMEOUT', seconds: 120, step: 'start' });
  await page.goto('/store/install/immich');
  await expect(page.getByText("Immich didn't start within 120 seconds.")).toBeVisible();
  await page.getByRole('button', { name: 'Remove partial install' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('Remove Immich?');
  await confirm.getByRole('button', { name: 'Remove' }).click();
  await expect(page).toHaveURL(/\/store\/app\/immich$/);
  await expect(page.getByRole('button', { name: 'Install', exact: true })).toBeVisible();
});
