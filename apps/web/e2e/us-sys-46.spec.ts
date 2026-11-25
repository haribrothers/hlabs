// US-SYS-46 · Sign in to the public dashboard (first-run instance, the pretend Cloudflare; desktop and phone, where
// LoginPublic is drawn). 07 §7.11's Tests line: two-factor required, no user list, a home session refused there (and
// a public one at home), the 12-hour end, and turning it off ending its sessions; plus the sessions list, the
// new-place notification with "Sign out everywhere", and invites and reset links never served there. There's no Caddy
// in e2e: `publicDashboard()` stands in for the public listener's dashboard route (see public-dashboard.ts).
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createMember } from './invites';
import { ADMIN, finishOnboardingWithTwoFactor } from './onboarding';
import { cloudflare } from './public-apps';
import {
  ageSessions,
  callFromPage,
  codesFor,
  DASHBOARD_HOST,
  DASHBOARD_URL,
  publicDashboard,
  setDashboard,
  signInPublic,
} from './public-dashboard';

test.use({ baseURL: FIRST_RUN_URL });

let code: () => Promise<string>;
test.beforeEach(async ({ page, request }) => {
  const { secret } = await finishOnboardingWithTwoFactor(page, request);
  code = codesFor(secret);
  await cloudflare(request, { reset: true, setUp: true });
  await setDashboard(request, true);
});
test.afterEach(async ({ request }) => {
  await cloudflare(request, { reset: true });
});

const visitor = (browser: Browser, use: BrowserContextOptions, ip?: string) => publicDashboard(browser, use, { ip });
/**
 * The session cookie the browser keeps for the page's own address. (The stand-in's fetches leave the daemon's answer in
 * the context's jar under 127.0.0.1 too; that one is never sent to the public address.)
 */
const sessionCookie = async (page: Page) => {
  const host = new URL(page.url()).hostname;
  return (await page.context().cookies()).find((c) => c.name === 'hlabs_session' && c.domain === host)?.value ?? null;
};
const meCode = async (page: Page) => (await callFromPage(page, 'auth.me', 'query')).error?.data?.hlabsCode ?? null;

test('US-SYS-46 the sign-in there: no list of who uses hlabs, no "Remember me", always the code, then Home there', async ({
  browser,
  page,
}, info) => {
  test.setTimeout(120_000);
  const there = await visitor(browser, info.project.use);
  await there.goto('/login');
  await expect(there).toHaveURL(`${DASHBOARD_URL}/login/username`);
  await expect(there.getByRole('heading', { level: 1, name: 'Sign in to hlabs' })).toBeVisible();
  await expect(there.getByText("Who's using hlabs?")).toHaveCount(0);
  await expect(there.getByRole('switch')).toHaveCount(0);
  await expect(there.getByText('Two-factor login is needed from the internet.')).toBeVisible();
  await expect(there.getByText(`From the internet · ${DASHBOARD_HOST}`)).toBeVisible();
  expect((await callFromPage(there, 'auth.listLoginUsers', 'query')).result).toMatchObject({
    data: { users: [], via: 'public' },
  });

  await signInPublic(there, ADMIN, code);
  await expect(there.getByRole('note')).toContainText(
    "You're using hlabs from the internet. Some changes only work at home or on your tailnet.",
  );
  // The session belongs to that address: host-only, and listed at home as the public dashboard.
  const cookie = (await there.context().cookies(DASHBOARD_URL)).find((c) => c.name === 'hlabs_session')!;
  expect(cookie).toMatchObject({ domain: DASHBOARD_HOST, secure: true, httpOnly: true });
  expect(cookie.expires).toBe(-1);
  await page.goto('/settings/account');
  await expect(page.getByText(/Public dashboard at hlabs\.example\.com/)).toBeVisible();

  // A sign-in from a new place tells the person, with "Sign out everywhere", which works from the notification.
  await page.goto('/');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  const panel = page.getByRole('dialog', { name: 'Notifications' });
  await expect(panel.getByText(/^New sign-in to hlabs from .*\(198\.51\.100\.7\)$/)).toBeVisible();
  await panel.getByRole('button', { name: 'Sign out everywhere' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Signed out everywhere else' })).toBeVisible();
  await expect.poll(() => meCode(there)).toBe('AUTH_REQUIRED');
});

test('US-SYS-46 someone without two-factor is told to turn it on at home, and gets no session', async ({
  browser,
  page,
  request,
}, info) => {
  test.setTimeout(90_000);
  const ravi = await createMember(page, request, FIRST_RUN_URL, { name: 'Ravi' });
  const there = await visitor(browser, info.project.use);
  await there.goto('/login');
  await there.getByLabel('Username').fill(ravi.username);
  await there.getByLabel('Password', { exact: true }).fill(ravi.password);
  await there.getByRole('button', { name: 'Continue' }).click();
  await expect(there.getByRole('alert')).toContainText(
    'Turn on two-factor login first. Signing in from the internet needs it. Turn it on in hlabs at home, under Settings › Account.',
  );
  expect(await sessionCookie(there)).toBeNull();
  await there.getByRole('button', { name: 'Back' }).click();
  await expect(there.getByLabel('Username')).toBeVisible();
});

test('US-SYS-46 a home session is refused there, a public one at home, and one there ends after 12 hours', async ({
  browser,
  page,
  request,
}, info) => {
  test.setTimeout(120_000);
  // The home session (this browser, signed in at home) on the public address: signed out there.
  const homeCookie = await sessionCookie(page);
  expect(homeCookie).not.toBeNull();
  const stranger = await visitor(browser, info.project.use);
  await stranger.context().addCookies([{ name: 'hlabs_session', value: homeCookie!, url: DASHBOARD_URL }]);
  await stranger.goto('/');
  await expect(stranger.getByRole('heading', { level: 1, name: 'Sign in to hlabs' })).toBeVisible();
  expect(await meCode(stranger)).toBe('AUTH_REQUIRED');

  // A public session at home: refused too.
  const there = await visitor(browser, info.project.use);
  await signInPublic(there, ADMIN, code);
  const publicCookie = await sessionCookie(there);
  const home = await (await browser.newContext({ baseURL: FIRST_RUN_URL })).newPage();
  await home.context().addCookies([{ name: 'hlabs_session', value: publicCookie!, url: FIRST_RUN_URL }]);
  await home.goto('/settings');
  expect(await meCode(home)).toBe('AUTH_REQUIRED');

  // However active, the public session ends 12 hours after it began.
  await ageSessions(request, ADMIN.username, 12 * 3_600_000 + 60_000);
  await there.reload();
  await expect(there.getByRole('heading', { level: 1, name: 'Sign in to hlabs' })).toBeVisible();
  expect(await meCode(there)).toBe('AUTH_REQUIRED');
});

test('US-SYS-46 making it private ends every session there', async ({ browser, request }, info) => {
  test.setTimeout(90_000);
  const there = await visitor(browser, info.project.use);
  await signInPublic(there, ADMIN, code);
  expect(await meCode(there)).toBeNull();
  await setDashboard(request, false);
  await expect.poll(() => meCode(there)).toBe('AUTH_REQUIRED');
  // On again: the old session still doesn't come back.
  await setDashboard(request, true);
  expect(await meCode(there)).toBe('AUTH_REQUIRED');
});

test('US-SYS-46 invites, reset links and setup are never served there', async ({ browser }, info) => {
  test.setTimeout(90_000);
  const there = await visitor(browser, info.project.use);
  for (const path of ['/invite/some-token', '/reset/some-token']) {
    await there.goto(path);
    await expect(there.getByRole('heading', { level: 1, name: 'Open this at home or on your tailnet.' })).toBeVisible();
  }
  for (const [path, type, input] of [
    ['invites.inspect', 'query', { token: 'some-token' }],
    ['auth.resetPassword', 'mutation', { token: 'some-token', newPassword: 'x' }],
    ['onboarding.createAdmin', 'mutation', { username: 'x', displayName: 'X', password: 'x' }],
  ] as const)
    expect((await callFromPage(there, path, type, input)).error?.data?.hlabsCode, path).toBe('HOME_ONLY');
});
