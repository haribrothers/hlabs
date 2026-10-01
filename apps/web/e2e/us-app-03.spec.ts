// US-APP-03 · Opening an app that isn't running (main instance, admin, desktop). Dev-only stand-ins in the stopped and
// error states; starting a real app, members and the engine stopping are covered by the daemon and component tests.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'not-running-demo';

// A skipped run (the phone project) must leave the stand-in alone: the desktop run may be using it.
test.afterEach(async ({ request }, info) => {
  if (info.status === 'skipped') return;
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
});

test("US-APP-03 a stopped app says so with Start, and one that isn't responding offers Restart app and Logs", async ({
  page,
  request,
}, info) => {
  test.skip(info.project.name === 'phone', 'The app window is the desktop layout; phones are 12-phone.md');
  await request.post(`${MAIN_URL}/dev/fake-app`, {
    data: { id: ID, name: 'Sleepy demo', embed: true, state: 'stopped' },
  });
  await page.goto(`/apps/${ID}`);
  const win = page.getByRole('region', { name: 'App window' });
  await expect(win.getByText('Sleepy demo is stopped.')).toBeVisible();
  await expect(win.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await expect(win.locator('iframe')).toHaveCount(0);

  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
  await request.post(`${MAIN_URL}/dev/fake-app`, {
    data: { id: ID, name: 'Sleepy demo', embed: true, state: 'error' },
  });
  await page.reload();
  await expect(win.getByText("Sleepy demo isn't responding.")).toBeVisible();
  await expect(win.getByRole('button', { name: 'Restart app' })).toHaveCount(2);
  await win.getByRole('button', { name: 'Logs', exact: true }).last().click();
  await expect(page).toHaveURL(new RegExp(`/apps/${ID}/logs$`));
});
