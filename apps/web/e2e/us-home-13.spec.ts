// US-HOME-13, 14 · The bell and its panel on Home, with notifications raised through /dev/notify (main instance, which
// other specs share: each run uses titles of its own and checks only those).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

test('US-HOME-13 the bell counts new notifications and opens the panel; US-HOME-14 acting and dismissing', async ({
  page,
  request,
}, info) => {
  const tag = `${info.project.name}-${Date.now().toString(36)}`;
  const notify = (data: Record<string, unknown>) => request.post(`${MAIN_URL}/dev/notify`, { data });
  await page.goto('/');
  const bell = page.getByRole('button', { name: /^Notifications/ });
  await expect(bell).toBeVisible();

  await notify({
    kind: 'e2e',
    severity: 'critical',
    title: `Kuma ${tag} couldn't start`,
    body: 'Port 3001 is in use by another program.',
    actions: [{ kind: 'navigate', to: '/settings/updates' }],
  });
  await notify({
    kind: 'auth.locked',
    severity: 'warning',
    title: `Repeated failed logins ${tag}`,
    body: '5 failed logins for @hari.',
    actions: [{ kind: 'navigate', to: '/settings/account' }],
  });
  await notify({
    kind: 'e2e',
    severity: 'success',
    title: `Backup ${tag} finished`,
    body: '11 apps backed up to NAS.',
  });
  // The badge follows the event stream, no reload.
  await expect(bell).toHaveAccessibleName(/^Notifications, \d+ new$/);

  await bell.click();
  const panel = page.getByRole('dialog', { name: 'Notifications' });
  await expect(panel.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  const today = panel.getByRole('region', { name: 'Today' });
  await expect(today.getByText(`Kuma ${tag} couldn't start`)).toBeVisible();
  await expect(today.getByRole('listitem').filter({ hasText: `Kuma ${tag}` })).toContainText('Just now');
  if (process.env.HLABS_SHOTS)
    await page.screenshot({ path: `${process.env.HLABS_SHOTS}/home-notifications-${info.project.name}.png` });
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);

  // Dismiss one: gone from the list.
  const backup = today.getByRole('listitem').filter({ hasText: `Backup ${tag} finished` });
  await backup.hover();
  await panel.getByRole('button', { name: `Dismiss "Backup ${tag} finished"` }).click();
  await expect(backup).toHaveCount(0);

  // Escape closes it, focus back on the bell.
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(bell).toBeFocused();

  // The lock notification's title opens Settings › Account.
  await bell.click();
  await panel.getByRole('link', { name: `Repeated failed logins ${tag}` }).click();
  await expect(page).toHaveURL(/\/settings\/account$/);
});
