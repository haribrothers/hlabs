// US-SYS-41 · Reach hlabs through a subnet router (first-run instance: the mode doesn't disturb other specs).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-SYS-41 choose the subnet router: the addresses from away, invite links at home, and back to Connect', async ({
  page,
  request,
}) => {
  await finishOnboarding(page, request);
  await page.goto('/settings/network');
  const remote = page.getByRole('group', { name: 'Remote access' });
  await expect(remote.getByText('I reach my home network through a Tailscale subnet router')).toBeVisible();
  await remote.getByRole('button', { name: 'Use subnet router' }).click();

  await expect(remote.getByText('Through your subnet router')).toBeVisible();
  await expect(remote.getByRole('button', { name: 'Connect' })).toBeHidden();
  await expect(remote.getByRole('button', { name: /^Copy https:\/\// }).first()).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Invite links use the home-network address (D-109).
  await page.goto('/settings/users');
  await page.getByRole('button', { name: 'Invite someone' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invite someone' });
  await expect(dialog.getByRole('textbox', { name: 'Invite link' })).toHaveValue(
    /^https:\/\/[^/]+\.local(:\d+)?\/invite\//,
  );
  await expect(dialog.getByText('At home')).toBeHidden();
  await dialog.getByRole('button', { name: 'Done' }).click();

  await page.goto('/settings/network');
  await remote.getByRole('button', { name: 'Use Tailscale on this computer instead' }).click();
  await expect(remote.getByRole('button', { name: 'Connect' })).toBeVisible();
});
