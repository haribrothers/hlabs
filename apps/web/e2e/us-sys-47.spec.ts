// US-SYS-47 · Some changes only work at home (first-run instance, the pretend Cloudflare; desktop and phone). 07
// §7.11's Tests line: every home-only procedure is refused from the public dashboard with HOME_ONLY (each called as
// the UI or anything else would, with an input tRPC accepts; the list is HOME_ONLY_PROCEDURES, kept the same by
// e2e/support/us-sys-47.unit.ts), the app tiles there, and stopping exposure still working there (making an app or the
// dashboard private). In the UI the home-only controls show "At home only" and explain. There's no Caddy in e2e:
// `publicDashboard()` stands in for the public listener's dashboard route (see public-dashboard.ts).
import { expect, test, type Page } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboardingWithTwoFactor } from './onboarding';
import { cloudflare, cloudflareState, fakeApp, makePublic, removeFakeApp } from './public-apps';
import {
  callFromPage,
  codesFor,
  DASHBOARD_HOST,
  publicDashboard,
  setDashboard,
  signInPublic,
} from './public-dashboard';
import { HOME_ONLY_CALLS } from './support/home-only-inputs';

test.use({ baseURL: FIRST_RUN_URL });

const PHOTOS = { id: 'sys47-photos', name: 'Photos demo', port: 12471 };
const NOTES = { id: 'sys47-demo', name: 'Notes demo', port: 12472 };

let code: () => Promise<string>;
test.beforeEach(async ({ page, request }) => {
  const { secret } = await finishOnboardingWithTwoFactor(page, request);
  code = codesFor(secret);
  await cloudflare(request, { reset: true, setUp: true });
  for (const a of [PHOTOS, NOTES]) await fakeApp(request, a.id, a.name, a.port);
  await page.goto('/settings/network');
  await makePublic(page, PHOTOS.id, 'photos');
  await setDashboard(request, true);
});
test.afterEach(async ({ request }) => {
  await cloudflare(request, { reset: true });
  for (const a of [PHOTOS, NOTES]) await removeFakeApp(request, a.id);
});

const explained = (page: Page) => page.getByRole('alertdialog', { name: 'Do this at home or on your tailnet' });

test('US-SYS-47 every home-only procedure is refused there with HOME_ONLY, admins too; stopping exposure still works', async ({
  browser,
  request,
}, info) => {
  test.setTimeout(120_000);
  const there = await publicDashboard(browser, info.project.use);
  await signInPublic(there, ADMIN, code);
  const refused: string[] = [];
  for (const [path, call] of Object.entries(HOME_ONLY_CALLS)) {
    const res = await callFromPage(there, path, call.type, call.input);
    if (res.error?.data?.hlabsCode === 'HOME_ONLY') refused.push(path);
    else expect.soft(res.error?.data?.hlabsCode ?? 'answered', path).toBe('HOME_ONLY');
  }
  expect(refused.sort()).toEqual(Object.keys(HOME_ONLY_CALLS).sort());
  // Nothing changed: still set up, still public.
  const state = await cloudflareState(request);
  expect(state.tunnels).toHaveLength(1);
  expect(state.records.map((r) => r.name)).toEqual(expect.arrayContaining([DASHBOARD_HOST, 'photos.example.com']));

  // Making an app private works there.
  const off = await callFromPage(there, 'apps.setPublic', 'mutation', { appId: PHOTOS.id, public: false });
  expect(off.error).toBeUndefined();
  await expect
    .poll(async () => (await cloudflareState(request)).records.map((r) => r.name), { timeout: 15_000 })
    .not.toContain('photos.example.com');
});

test('US-SYS-47 in the dashboard there, home-only controls say "At home only" and explain; Make private still works', async ({
  browser,
  request,
}, info) => {
  test.setTimeout(120_000);
  const there = await publicDashboard(browser, info.project.use);
  await signInPublic(there, ADMIN, code);
  await there.goto('/settings/network');
  await expect(there.getByRole('note')).toContainText("You're using hlabs from the internet.");
  const group = there.getByRole('group', { name: 'Public access' });
  const remove = group.getByRole('button', { name: 'Remove, at home only' });
  await expect(remove).toContainText('At home only');
  await remove.click();
  await expect(explained(there)).toContainText(
    "Removing Cloudflare Tunnel only works from hlabs at home or on your tailnet, so someone with your password and code can't do it from the internet.",
  );
  await explained(there).getByRole('button', { name: 'OK' }).click();
  await expect(explained(there)).toBeHidden();
  expect((await cloudflareState(request)).tunnels).toHaveLength(1);
  // Changing how it's public is at home only too; making it private isn't.
  await expect(group.getByRole('button', { name: /Add Cloudflare's sign-in, at home only/ })).toBeVisible();

  await there.goto('/settings/users');
  await there.getByRole('button', { name: 'Invite someone, at home only' }).first().click();
  await expect(explained(there)).toContainText('Inviting someone only works');
  await explained(there).getByRole('button', { name: 'OK' }).click();

  // Making the dashboard private works from there, and ends this session too.
  await there.goto('/settings/network');
  await there
    .getByRole('group', { name: 'Public access' })
    .getByRole('button', { name: 'Make private: Dashboard' })
    .click();
  const ask = there.getByRole('alertdialog', { name: 'Make the dashboard private?' });
  await expect(ask).toContainText('everyone signed in there is signed out, you too');
  await ask.getByRole('button', { name: 'Make private' }).click();
  await expect
    .poll(async () => (await cloudflareState(request)).records.map((r) => r.name), { timeout: 15_000 })
    .not.toContain(DASHBOARD_HOST);
  await expect
    .poll(async () => (await callFromPage(there, 'auth.me', 'query')).error?.data?.hlabsCode)
    .toBe('AUTH_REQUIRED');
});

test('US-SYS-47 Home there: a public app opens at its public address, another says it opens at home', async ({
  browser,
}, info) => {
  test.setTimeout(120_000);
  const there = await publicDashboard(browser, info.project.use);
  await signInPublic(there, ADMIN, code);
  await there.evaluate(() => {
    const w = window as unknown as { opened: string[] };
    w.opened = [];
    window.open = (url?: string | URL) => {
      w.opened.push(String(url));
      return null;
    };
  });
  const photos = there.getByRole('button', { name: 'Photos demo, public, opens photos.example.com' });
  await expect(photos).toContainText('photos.example.com');
  await photos.click();
  expect(await there.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual([
    'https://photos.example.com',
  ]);

  const notes = there.getByRole('button', { name: 'Notes demo, at home only' });
  await expect(notes).toContainText('At home only');
  await notes.click();
  const pop = there.getByRole('dialog', { name: 'Notes demo opens at home or on your tailnet.' });
  await expect(pop).toContainText("It isn't public, so it can't be reached from the internet.");
  await pop.getByRole('button', { name: 'Make Notes demo public, at home only' }).click();
  await expect(explained(there)).toContainText('Making an app public only works');
  expect(await there.evaluate(() => (window as unknown as { opened: string[] }).opened)).toHaveLength(1);
});
