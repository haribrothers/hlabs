// US-APP-06 · Behaviour switches (main instance, admin, desktop): "Start automatically" saves at once and is still
// off after a reload. Later phases' switches are hidden.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'behaviour-demo';

// A skipped run (the phone project) must leave the stand-in alone: the desktop run may be using it.
test.afterEach(async ({ request }, info) => {
  if (info.status === 'skipped') return;
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
});

test('US-APP-06 "Start automatically" saves at once and keeps its value', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'App settings on a phone is 12-phone.md');
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name: 'Behaviour demo' } });
  await page.goto(`/apps/${ID}/settings`);
  const behaviour = page.getByRole('group', { name: 'Behaviour' });
  const toggle = behaviour.getByRole('switch', { name: 'Start automatically' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(behaviour.getByRole('switch', { name: 'Include in backups' })).toHaveCount(0);
  await expect(behaviour.getByRole('switch', { name: 'Update automatically' })).toHaveCount(0);
});
