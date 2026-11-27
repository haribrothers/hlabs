// US-APP-28 · Choose who gets into a public app (first-run instance, the pretend Cloudflare). 07 §7.10's Tests line:
// the login in front (hlabs's sign-in on the public address, then the two-factor code, a host-only cookie), two-factor
// for everyone, 403 for people the app isn't shared with, the 404s, and the headers. There's no Caddy in e2e:
// `publicAddress()` stands in for the public listener and forward auth (see public-apps.ts); Caddy's own routing (only
// the app's web service, the dashboard's paths and other apps 404, hlabs's cookie removed) is in the daemon's tests.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { generateSync } from 'otplib';
import { trpc } from './app-settings';
import { FIRST_RUN_URL } from './instances';
import { createMember, signedInAs } from './invites';
import { ADMIN, finishOnboardingWithTwoFactor } from './onboarding';
import {
  APP_PAGE,
  atPublicAddress,
  DAEMON_URL,
  listenerHeaders,
  cloudflare,
  fakeApp,
  makePublic,
  publicAddress,
  removeFakeApp,
  signInThere,
} from './public-apps';

test.use({ baseURL: FIRST_RUN_URL });

const ID = 'app28-photos';
const NAME = 'Photos demo';
const HOST = 'photos.example.com';

let secret = '';
test.beforeEach(async ({ page, request }) => {
  ({ secret } = await finishOnboardingWithTwoFactor(page, request));
  await cloudflare(request, { reset: true, setUp: true });
  await fakeApp(request, ID, NAME, 12481);
  await makePublic(page, ID, 'photos');
});
test.afterEach(async ({ request }) => {
  await cloudflare(request, { reset: true });
  await removeFakeApp(request, ID);
});

/** A fresh browser on the public address, signed in to nothing. */
async function visitor(browser: Browser, ip?: string): Promise<Page> {
  const context = await browser.newContext({ baseURL: `https://${HOST}` });
  await publicAddress(context, HOST, ip);
  return context.newPage();
}

/**
 * A code hlabs hasn't seen yet: a code works once, and hlabs refuses its step and every earlier one after that (replay),
 * so this waits for the next 30-second step when the newest one it may use was taken already (seeding the admin, or
 * another sign-in in this run).
 */
let lastStep = 0;
const nextCode = async () => {
  for (;;) {
    const step = Math.floor(Date.now() / 30_000) + 1;
    if (step > lastStep) {
      lastStep = step;
      return generateSync({ secret, epoch: step * 30 });
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
};

test('US-APP-28 the hlabs login in front: password, then the code, then the app; the cookie is for that address only', async ({
  browser,
  page,
}, info) => {
  test.setTimeout(90_000);
  const visit = await visitor(browser);
  await visit.goto('/albums/summer');
  // Forward auth sends a browser that isn't signed in to hlabs's sign-in, on the public address itself.
  await expect(visit).toHaveURL(`https://${HOST}/.hlabs/sign-in?next=%2Falbums%2Fsummer`);
  await expect(visit.getByRole('heading', { name: `Sign in to open ${NAME}` })).toBeVisible();
  await expect(visit.getByText(`${HOST} is shared from an hlabs home server.`, { exact: false })).toBeVisible();
  await expect(visit.getByText(`Your hlabs account, not your ${NAME} one.`)).toBeVisible();
  await expect(visit.getByText('Protected by hlabs')).toBeVisible();

  // A wrong password says so.
  await visit.getByLabel('Username').fill(ADMIN.username);
  await visit.getByLabel('Password').fill('not the password');
  await visit.getByRole('button', { name: 'Continue' }).click();
  await expect(visit.getByText('That username or password is wrong. Check them and try again.')).toBeVisible();

  await signInThere(visit, ADMIN, nextCode);
  await expect(visit).toHaveURL(`https://${HOST}/albums/summer`);
  await expect(visit.getByRole('heading', { name: APP_PAGE })).toBeVisible();
  const cookie = (await visit.context().cookies(`https://${HOST}`)).find((c) => c.name === '__Host-hlabs_pub');
  expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax', path: '/' });
  expect(cookie?.domain).toBe(HOST);

  // That session is listed with Hari's others, naming the address.
  if (!info.project.name.includes('phone')) {
    await page.goto('/settings/account');
    await expect(page.getByText(new RegExp(`Public app at ${HOST.replace(/\./g, '\\.')} · `))).toBeVisible();
  }
  await visit.context().close();
});

test('US-APP-28 two-factor for everyone, and 403 for people the app is not shared with', async ({
  browser,
  page,
  request,
}, info) => {
  test.skip(info.project.name.includes('phone'), 'the same pages; once is enough');
  test.setTimeout(120_000);
  // Ravi has access but no two-factor; Asha has two-factor but no access.
  const ravi = await createMember(page, request, FIRST_RUN_URL, { name: 'Ravi', apps: [NAME] });
  const asha = await createMember(page, request, FIRST_RUN_URL, { name: 'Asha' });
  const ashaPage = await signedInAs(browser, {}, FIRST_RUN_URL, asha);
  const begin = await trpc(ashaPage, 'account.totp.begin', { password: asha.password }, true);
  const ashaSecret = (begin.result?.data as { secret: string }).secret;
  const confirmed = await trpc(ashaPage, 'account.totp.confirm', { code: generateSync({ secret: ashaSecret }) }, true);
  expect(confirmed.error).toBeUndefined();
  await ashaPage.context().close();

  const r = await visitor(browser);
  await r.goto('/');
  await r.getByLabel('Username').fill(ravi.username);
  await r.getByLabel('Password').fill(ravi.password);
  await r.getByRole('button', { name: 'Continue' }).click();
  await expect(r.getByText('Turn on two-factor login first.')).toBeVisible();
  await expect(r.getByText(`Opening ${NAME} from the internet needs it.`, { exact: false })).toBeVisible();
  await expect(r.getByRole('link', { name: 'Back' })).toBeVisible();
  await r.context().close();

  const a = await visitor(browser, '198.51.100.8');
  await a.goto('/');
  // Her password is right, but the app isn't shared with her: told so, with no session.
  await a.getByLabel('Username').fill(asha.username);
  await a.getByLabel('Password').fill(asha.password);
  await a.getByRole('button', { name: 'Continue' }).click();
  await expect(a.getByRole('heading', { name: "You don't have access to this" })).toBeVisible();
  await expect(a.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(a.getByRole('heading', { name: APP_PAGE })).toHaveCount(0);
  await a.context().close();
});

test('US-APP-28 the 404s and the headers on a public address', async ({ request }, info) => {
  test.skip(info.project.name.includes('phone'), 'no browser layout involved');
  const at = atPublicAddress(request, HOST);
  const page = await at.get('/.hlabs/sign-in');
  expect(page.status()).toBe(200);
  const h = page.headers();
  expect(h['content-type']).toBe('text/html; charset=utf-8');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['cache-control']).toBe('no-store');
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['content-security-policy']).toContain("form-action 'self'");

  // A name hlabs doesn't know, and nothing else under /.hlabs/, answer 404.
  expect((await atPublicAddress(request, 'nope.example.com').get('/.hlabs/sign-in')).status()).toBe(404);
  expect((await atPublicAddress(request, 'nope.example.com').get('/auth/public-verify')).status()).toBe(404);
  // Forward auth: a page asks to sign in (302), anything else is 401 without a session.
  const nav = await at.get('/auth/public-verify', {
    accept: 'text/html',
    'x-forwarded-uri': '/x',
    'x-forwarded-method': 'GET',
  });
  expect(nav.status()).toBe(302);
  expect(nav.headers().location).toBe('/.hlabs/sign-in?next=%2Fx');
  expect((await at.get('/auth/public-verify', { accept: 'application/json' })).status()).toBe(401);
  // A form post from anywhere but the public address itself is refused (D-178).
  const forged = await request.post(`${DAEMON_URL}/.hlabs/sign-in`, {
    headers: { ...listenerHeaders(HOST), origin: 'https://evil.example' },
    form: { username: ADMIN.username, password: ADMIN.password, next: '/' },
    maxRedirects: 0,
  });
  expect(forged.status()).toBe(403);
});
