// US-ACCT-22 · Choose the invitee's role and apps (main instance, signed in as an admin).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

/** One per project: desktop and phone run at the same time on the same instance. */
const idFor = (project: string) => `invite-demo-${project}`;
const nameFor = (project: string) => `Invite demo ${project}`;

test.beforeAll(async ({ request }, info) => {
  await request.post(`${MAIN_URL}/dev/fake-app`, {
    data: { id: idFor(info.project.name), name: nameFor(info.project.name) },
  });
});
test.afterAll(async ({ request }, info) => {
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: idFor(info.project.name), remove: true } });
});

test('US-ACCT-22 apps to share for a member, none for an admin', async ({ page }, info) => {
  const appName = nameFor(info.project.name);
  await page.goto('/settings/users');
  await page.getByRole('button', { name: 'Invite someone' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invite someone' });
  await expect(dialog.getByRole('textbox', { name: 'Invite link' })).toHaveValue(/\/invite\//);
  await expect(dialog.getByRole('radio', { name: /Member/ })).toHaveAttribute('aria-checked', 'true');
  const share = dialog.getByRole('switch', { name: appName });
  await expect(share).toHaveAttribute('aria-checked', 'false');
  await share.click();
  await expect(share).toHaveAttribute('aria-checked', 'true');
  if (process.env.HLABS_SHOTS)
    await page.screenshot({ path: `${process.env.HLABS_SHOTS}/invite-apps-${info.project.name}.png` });
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);

  await dialog.getByRole('radio', { name: /Admin/ }).click();
  await expect(dialog.getByText('Admins can open every app.')).toBeVisible();
  await expect(dialog.getByRole('switch', { name: appName })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close' }).click();
});
