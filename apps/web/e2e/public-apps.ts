// Public apps in e2e (US-SYS-43, 44, US-APP-27…29; 07 §7.10's Tests line), on this worker's first-run instance with
// the pretend Cloudflare (HLABS_DEV_FAKE_CLOUDFLARE): its zone is example.com, where example.com, www.example.com and
// mail.example.com exist already; only `fake-cloudflare-token-0123456789` is a good API token.
//
// There's no Caddy in e2e, so `publicAddress()` stands in for the public listener in a browser: requests to
// `https://<host>/.hlabs/*` go to hlabsd with `X-Hlabs-Public-Host` (as only that listener sets it) and the visitor's
// address, and anything else is asked of `/auth/public-verify` first (forward auth) and answered by a stand-in app
// page when it's let through, as Caddy would pass it to the app.
import {
  expect,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Page,
  type Route,
} from '@playwright/test';
import { trpc } from './app-settings';
import { FIRST_RUN_URL, firstRunPorts } from './instances';

/** This worker's first-run hlabsd itself (the public pages aren't behind Vite's proxy). */
export const DAEMON_URL = `http://127.0.0.1:${firstRunPorts(Number(process.env.TEST_PARALLEL_INDEX ?? 0)).daemon}`;
export const DOMAIN = 'example.com';
export const GOOD_TOKEN = 'fake-cloudflare-token-0123456789';
/** What the stand-in app answers once forward auth lets a visitor through. */
export const APP_PAGE = 'Hello from the app';

/** The pretend Cloudflare: `reset` makes everything private and removes the tunnel (and Visits, refused addresses). */
export async function cloudflare(request: APIRequestContext, body: Record<string, unknown>) {
  const res = await request.post(`${FIRST_RUN_URL}/dev/cloudflare`, { data: body });
  expect(res.ok()).toBe(true);
  return (await res.json()) as {
    records: Array<{ name: string; byHlabs: boolean }>;
    tunnels: string[];
    connector: string;
  };
}

/** Its zone's DNS and tunnels now. */
export async function cloudflareState(request: APIRequestContext) {
  const res = await request.get(`${FIRST_RUN_URL}/dev/cloudflare`);
  expect(res.ok()).toBe(true);
  return (await res.json()) as { records: Array<{ name: string; byHlabs: boolean }>; tunnels: string[] };
}

/** A stand-in installed app with a web port (so it has a route), running. */
export async function fakeApp(request: APIRequestContext, id: string, name: string, port: number) {
  const res = await request.post(`${FIRST_RUN_URL}/dev/fake-app`, { data: { id, name, port } });
  expect(res.ok()).toBe(true);
}

export async function removeFakeApp(request: APIRequestContext, id: string) {
  await request.post(`${FIRST_RUN_URL}/dev/fake-app`, { data: { id, remove: true } });
}

/** Makes an app public over the API as the signed-in admin (the page must be on the dashboard), and waits for it. */
export async function makePublic(page: Page, appId: string, hostname: string, access: 'hlabs' | 'ownLogin' = 'hlabs') {
  const res = await trpc(
    page,
    'apps.setPublic',
    { appId, public: true, hostname, access, ...(access === 'ownLogin' ? { understood: true } : {}) },
    true,
  );
  expect(res.error).toBeUndefined();
  await expect
    .poll(
      async () => ((await trpc(page, 'apps.get', { appId })).result?.data as { public?: unknown })?.public ?? null,
      {
        timeout: 15_000,
      },
    )
    .not.toBeNull();
}

/** Headers the public listener adds before a request reaches hlabsd. */
export const listenerHeaders = (host: string, ip = '198.51.100.7') => ({
  'x-hlabs-public-host': host,
  'x-forwarded-for': ip,
  'x-forwarded-proto': 'https',
});

/**
 * `https://<host>` in this browser context, as the public listener and Cloudflare would answer it (see the top). The
 * cookie hlabs sets there is a real host-only `__Host-` cookie on that https origin.
 */
/**
 * Passes a daemon answer on to the browser. Chromium doesn't follow a redirect that a route fulfils, so a redirect is
 * answered with a page that goes on to the same address on the public name at once (keeping any cookie it sets), as
 * Caddy's redirect would; everything else as it came.
 */
function passOn(route: Route, response: APIResponse, host: string) {
  const location = response.headers().location;
  if (!location) return route.fulfill({ response });
  const to = new URL(location, `https://${host}`).toString();
  const headers = { ...response.headers() };
  delete headers.location;
  delete headers['content-length'];
  // The daemon's CSP is for its own pages; the stand-in page's one script must run.
  delete headers['content-security-policy'];
  return route.fulfill({
    status: 200,
    headers: { ...headers, 'content-type': 'text/html; charset=utf-8' },
    body: `<!doctype html><title>Redirect</title><script>location.replace(${JSON.stringify(to)})</script>`,
  });
}

export async function publicAddress(context: BrowserContext, host: string, ip = '198.51.100.7') {
  await context.route(`https://${host}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = `${url.pathname}${url.search}`;
    const headers: Record<string, string> = { ...(await request.allHeaders()), ...listenerHeaders(host, ip) };
    delete headers.host;
    if (url.pathname.startsWith('/.hlabs/')) {
      const response = await route.fetch({ url: `${DAEMON_URL}${path}`, headers, maxRedirects: 0 });
      return passOn(route, response, host);
    }
    // Forward auth first, as Caddy asks it.
    const verify = await route.fetch({
      url: `${DAEMON_URL}/auth/public-verify`,
      method: 'GET',
      postData: undefined,
      headers: { ...headers, 'x-forwarded-method': request.method(), 'x-forwarded-uri': path },
      maxRedirects: 0,
    });
    if (verify.status() === 200)
      return route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><title>App</title><h1>${APP_PAGE}</h1><p>${verify.headers()['x-hlabs-user'] ?? ''}</p>`,
      });
    return passOn(route, verify, host);
  });
}

/** A request straight to hlabsd as if through the public listener (headers, rate limits, 404s). */
export function atPublicAddress(request: APIRequestContext, host: string, ip?: string) {
  const headers = listenerHeaders(host, ip);
  return {
    get: (path: string, extra: Record<string, string> = {}) =>
      request.get(`${DAEMON_URL}${path}`, { headers: { ...headers, ...extra }, maxRedirects: 0 }),
    signIn: (form: Record<string, string>) =>
      request.post(`${DAEMON_URL}/.hlabs/sign-in`, {
        headers: { ...headers, origin: `https://${host}` },
        form,
        maxRedirects: 0,
      }),
  };
}

/** Signs in on a public address in the browser: username, password, then the code from `secret`. */
export async function signInThere(
  page: Page,
  who: { username: string; password: string },
  code: () => string | Promise<string>,
) {
  await page.getByLabel('Username').fill(who.username);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Type the 6-digit code from your authenticator app.')).toBeVisible();
  const digits = await code();
  for (let i = 0; i < 6; i++) await page.getByLabel(`Digit ${i + 1}`).fill(digits[i]!);
}
