// US-SYS-04 · See each app's tailnet address (first-run instance, pretend Tailscale).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { removeFakeApps } from './invites';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });
test.afterEach(({ request }) => removeFakeApps(request, FIRST_RUN_URL, ['tailnet-demo']));

test('US-SYS-04 the dashboard and apps on the tailnet; an app installed meanwhile appears without a reload', async ({
  page,
  request,
}) => {
  await finishOnboarding(page, request);
  await request.post(`${FIRST_RUN_URL}/dev/tailscale`, {
    data: { state: 'running', tailnet: 'tail9.ts.net', nodeName: 'hari-home' },
  });
  await page.goto('/settings/network');
  const remote = page.getByRole('group', { name: 'Remote access' });
  await remote.getByRole('button', { name: 'Connect' }).click();
  await page
    .getByRole('dialog', { name: 'Publish hlabs on tail9.ts.net?' })
    .getByRole('button', { name: 'Connect' })
    .click();
  await expect(remote.getByRole('link', { name: 'https://hari-home.tail9.ts.net', exact: true })).toBeVisible();

  await request.post(`${FIRST_RUN_URL}/dev/fake-app`, {
    data: { id: 'tailnet-demo', name: 'Tailnet demo', port: 12555 },
  });
  await expect(remote.getByText('Tailnet demo')).toBeVisible({ timeout: 10_000 });
  await expect(remote.getByRole('link', { name: /^https:\/\/hari-home\.tail9\.ts\.net:14555$/ })).toBeVisible();

  await removeFakeApps(request, FIRST_RUN_URL, ['tailnet-demo']);
  await expect(remote.getByText('Tailnet demo')).toHaveCount(0, { timeout: 10_000 });
});
