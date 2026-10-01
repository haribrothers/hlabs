// US-APP-05 · App address and tailnet address (main instance, admin, desktop). A dev-only stand-in; the fallback and
// tailnet addresses are covered by the daemon and component tests.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'address-demo';

// A skipped run (the phone project) must leave the stand-in alone: the desktop run may be using it.
test.afterEach(async ({ request }, info) => {
  if (info.status === 'skipped') return;
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
});

test('US-APP-05 Access shows the app address as a link with Copy, which says "Address copied"', async ({
  page,
  context,
  request,
}, info) => {
  test.skip(info.project.name === 'phone', 'App settings on a phone is 12-phone.md');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name: 'Address demo' } });
  await page.goto(`/apps/${ID}/settings`);
  const access = page.getByRole('group', { name: 'Access' });
  const link = access.getByRole('link', { name: `https://${ID}.hlabs.local` });
  await expect(link).toHaveAttribute('target', '_blank');
  await access.getByRole('button', { name: `Copy https://${ID}.hlabs.local` }).click();
  await expect(page.getByText('Address copied')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`https://${ID}.hlabs.local`);
  await expect(page.getByText('Also on your tailnet')).toHaveCount(0);
});
