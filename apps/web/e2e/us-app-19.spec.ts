// US-APP-19 · Require hlabs login (main instance, admin, desktop): the Access section's switch, the warning before
// turning it off, and that it stays off after a reload (the route changes at once, no restart).
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'login-demo';

test.afterEach(async ({ request }, info) => {
  if (info.status === 'skipped') return;
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
});

test('US-APP-19 turning "Require hlabs login" off asks first and saves at once', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'App settings on a phone is 12-phone.md');
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name: 'Login demo' } });
  await page.goto(`/apps/${ID}/settings`);
  const access = page.getByRole('group', { name: 'Access' });
  const toggle = access.getByRole('switch', { name: 'Require hlabs login' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(access.getByText(/Adds your hlabs sign-in in front of the app/)).toBeVisible();
  await toggle.click();
  const dialog = page.getByRole('dialog', { name: 'Turn off hlabs login for Login demo?' });
  await expect(dialog).toContainText("will see Login demo's own sign-in page.");
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Turn off' }).click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
});
