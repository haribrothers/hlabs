// US-APP-10 · Download logs (main instance, admin, desktop). A dev-only stand-in with no containers downloads an
// empty file under the right name; the file's lines and member access are covered by the daemon tests.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'download-demo';

// A skipped run (the phone project) must leave the stand-in alone: the desktop run may be using it.
test.afterEach(async ({ request }, info) => {
  if (info.status === 'skipped') return;
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
});

test('US-APP-10 Download saves <appId>-logs-<YYYYMMDD-HHmm>.log', async ({ page, request }, info) => {
  test.skip(info.project.name === 'phone', 'Logs on a phone is 12-phone.md');
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name: 'Download demo' } });
  await page.goto(`/apps/${ID}/logs`);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(new RegExp(`^${ID}-logs-\\d{8}-\\d{4}\\.log$`));
});
