// US-ACCT-24 · Choose which apps a member can open (main instance, signed in as an admin).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';
import { createMember } from './invites';

const idFor = (project: string) => `access-demo-${project}`;
const appFor = (project: string) => `Access demo ${project}`;

test.beforeAll(async ({ request }, info) => {
  await request.post(`${MAIN_URL}/dev/fake-app`, {
    data: { id: idFor(info.project.name), name: appFor(info.project.name) },
  });
});
test.afterAll(async ({ request }, info) => {
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: idFor(info.project.name), remove: true } });
});

test('US-ACCT-24 share an app with a member and Save: their row counts it', async ({ page, request }, info) => {
  const name = `Access ${info.project.name} ${Date.now()}`;
  await createMember(page, request, MAIN_URL, { name });
  await page.goto('/settings/users');
  const row = page.locator('.hl-list-row', { hasText: name });
  await expect(row).toContainText('0 apps');
  await row.getByRole('button', { name: 'Apps access' }).click();

  const dialog = page.getByRole('dialog', { name: new RegExp(`What ${name} can open`) });
  const share = dialog.getByRole('switch', { name: appFor(info.project.name) });
  await expect(share).toHaveAttribute('aria-checked', 'false');
  await share.click();
  if (process.env.HLABS_SHOTS)
    await page.screenshot({ path: `${process.env.HLABS_SHOTS}/apps-access-${info.project.name}.png` });
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Saved')).toBeVisible();
  await expect(row).toContainText('1 app');
});
