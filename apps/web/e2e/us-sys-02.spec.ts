// US-SYS-02 · Connect remote access with Tailscale (first-run instance, with the pretend Tailscale: the e2e daemon
// never touches a real one, and the log-in page is about:blank, never the internet).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

const tailscale = (request: APIRequestContext, body: Record<string, unknown>) =>
  request.post(`${FIRST_RUN_URL}/dev/tailscale`, { data: body });

test('US-SYS-02 signed out: log in in a new tab, then hlabs connects on its own', async ({
  page,
  request,
  context,
}, info) => {
  await finishOnboarding(page, request);
  await tailscale(request, { state: 'needs_login' });
  await page.goto('/settings/network');
  const remote = page.getByRole('group', { name: 'Remote access' });
  const [login] = await Promise.all([
    context.waitForEvent('page'),
    remote.getByRole('button', { name: 'Connect' }).click(),
  ]);
  await expect(remote.getByText('Waiting for sign-in…')).toBeVisible();
  await login.close();

  // The person signs in, in the other tab.
  await tailscale(request, { state: 'running', nodeName: 'hlabs', reset: false });
  await expect(remote.getByText('Connected')).toBeVisible({ timeout: 6_000 });
  await expect(remote.getByText('hlabs.tail1234.ts.net', { exact: true })).toBeVisible();
  if (process.env.HLABS_SHOTS)
    await page.screenshot({ path: `${process.env.HLABS_SHOTS}/remote-${info.project.name}.png` });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('US-SYS-02 already signed in: confirm the tailnet; the computer keeps its own name', async ({ page, request }) => {
  await finishOnboarding(page, request);
  await tailscale(request, { state: 'running', tailnet: 'tail9.ts.net', nodeName: 'hari-home' });
  await page.goto('/settings/network');
  const remote = page.getByRole('group', { name: 'Remote access' });
  await remote.getByRole('button', { name: 'Connect' }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish hlabs on tail9.ts.net?' });
  await expect(dialog).toContainText('https://hari-home.tail9.ts.net');
  await dialog.getByRole('button', { name: 'Connect' }).click();
  await expect(remote.getByText('hari-home.tail9.ts.net', { exact: true })).toBeVisible();
  await expect(page.getByText('Remote access is on')).toBeVisible();
});

test('US-SYS-02 not installed: Get Tailscale, no Connect', async ({ page, request }) => {
  await finishOnboarding(page, request);
  await tailscale(request, { state: 'not_installed' });
  await page.goto('/settings/network');
  const remote = page.getByRole('group', { name: 'Remote access' });
  await expect(remote.getByText('Not installed')).toBeVisible();
  await expect(remote.getByRole('link', { name: 'Get Tailscale' })).toBeVisible();
  await expect(remote.getByRole('button', { name: 'Connect' })).toHaveCount(0);
});
