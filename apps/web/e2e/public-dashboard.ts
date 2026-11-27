// The public dashboard in e2e (US-SYS-45…48; 07 §7.11's Tests line), on this worker's first-run instance with the
// pretend Cloudflare. There's no Caddy in e2e: `publicDashboard()` stands in for the public listener's dashboard route
// in a fresh browser context. `https://hlabs.example.com/**` goes to this worker's Vite (the dashboard) and daemon
// (its /trpc, /api and /healthz, as Caddy routes them) with exactly the headers Caddy's public listener sets there:
// `X-Hlabs-Via: public`, `X-Hlabs-Public-Host`, `X-Forwarded-Host`, `X-Forwarded-For` (the visitor) and Cloudflare's
// `CF-IPCountry`. Its cookie is the real host-only `hlabs_session` on that https origin.
import { expect, type APIRequestContext, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { generateSync } from 'otplib';
import { FIRST_RUN_URL } from './instances';
import { DAEMON_URL, passOn } from './public-apps';

export const DASHBOARD_HOST = 'hlabs.example.com';
export const DASHBOARD_URL = `https://${DASHBOARD_HOST}`;

/** Headers the public listener adds on the dashboard's name (and every other server deletes). */
export const dashboardHeaders = (host = DASHBOARD_HOST, ip = '198.51.100.7', country = 'NL') => ({
  'x-hlabs-via': 'public',
  'x-hlabs-public-host': host,
  'x-forwarded-host': host,
  'x-forwarded-for': ip,
  'x-forwarded-proto': 'https',
  'cf-ipcountry': country,
});

/** A fresh browser on the dashboard's public address (see the top); `use` is the project's (desktop or phone). */
export async function publicDashboard(
  browser: Browser,
  use: BrowserContextOptions,
  opts: { ip?: string; country?: string } = {},
): Promise<Page> {
  const { storageState: _signedIn, baseURL: _base, ...device } = use as BrowserContextOptions & { baseURL?: string };
  const context = await browser.newContext({ ...device, baseURL: DASHBOARD_URL });
  await context.route(`${DASHBOARD_URL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    // The event stream never ends, and a route can only answer once it has: the stand-in has none (204 stops the
    // browser asking again); lists follow by asking, as they do when events are late.
    if (url.pathname.startsWith('/trpc/events.stream')) return route.fulfill({ status: 204 });
    const headers: Record<string, string> = {
      ...(await request.allHeaders()),
      ...dashboardHeaders(DASHBOARD_HOST, opts.ip, opts.country),
    };
    delete headers.host;
    // The daemon's own paths go straight to it, as Caddy sends them; the rest is the dashboard (Vite). Every page here
    // loads hundreds of modules through this route (no cache while a route is set), and a /healthz stuck behind them
    // for 4 seconds would show "Can't reach hlabs".
    const daemon = /^\/(trpc|api|healthz)(\/|$)/.test(url.pathname);
    const response = await route.fetch({
      url: `${daemon ? DAEMON_URL : FIRST_RUN_URL}${url.pathname}${url.search}`,
      headers,
      maxRedirects: 0,
    });
    return passOn(route, response, DASHBOARD_HOST);
  });
  return context.newPage();
}

/** Makes the dashboard public at hlabs.example.com over the dev route (as the first admin), or private with null. */
export async function setDashboard(request: APIRequestContext, on: boolean) {
  const res = await request.post(`${FIRST_RUN_URL}/dev/cloudflare`, {
    data: { dashboard: on ? { hostname: 'hlabs' } : null },
  });
  expect(res.ok(), await res.text()).toBe(true);
}

/** Moves a person's sessions back in time by `ms` (the public dashboard's 12-hour end). */
export async function ageSessions(request: APIRequestContext, username: string, ms: number, publicOnly = true) {
  const res = await request.post(`${DAEMON_URL}/dev/age-sessions`, { data: { username, ms, publicOnly } });
  expect(res.ok()).toBe(true);
}

/**
 * Codes hlabs hasn't seen yet for `secret`: a code works once, and hlabs refuses its step and every earlier one after
 * that, so this waits for the next 30-second step when the newest it may use was taken already.
 */
export function codesFor(secret: string) {
  let lastStep = 0;
  return async () => {
    for (;;) {
      const step = Math.floor(Date.now() / 30_000) + 1;
      if (step > lastStep) {
        lastStep = step;
        return generateSync({ secret, epoch: step * 30 });
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  };
}

/** Signs in on the public dashboard (LoginPublic, then the code), ending on Home there. */
export async function signInPublic(
  page: Page,
  who: { username: string; password: string },
  code: () => Promise<string>,
) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in to hlabs' })).toBeVisible();
  await page.getByLabel('Username').fill(who.username);
  await page.getByLabel('Password', { exact: true }).fill(who.password);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByLabel('Digit 1')).toBeVisible();
  const digits = await code();
  for (let i = 0; i < 6; i++) await page.getByLabel(`Digit ${i + 1}`).fill(digits[i]!);
  await expect(page).toHaveURL(`${DASHBOARD_URL}/`);
}

/** tRPC from the page, as its own fetches go (through the stand-in on the public address), with the CSRF token. */
export async function callFromPage(page: Page, path: string, type: 'query' | 'mutation', input?: unknown) {
  return page.evaluate(
    async ({ path, type, input }) => {
      const me = (await (await fetch('/trpc/auth.me')).json()) as { result?: { data: { csrfToken: string } } };
      const res =
        type === 'mutation'
          ? // No input goes batched, as the dashboard sends it (an empty object isn't "no input").
            await fetch(`/trpc/${path}${input === undefined ? '?batch=1' : ''}`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-hlabs-csrf': me.result?.data.csrfToken ?? '' },
              body: input === undefined ? '{}' : JSON.stringify(input),
            })
          : await fetch(`/trpc/${path}${input ? `?input=${encodeURIComponent(JSON.stringify(input))}` : ''}`);
      type Reply = { result?: unknown; error?: { data?: { hlabsCode?: string } } };
      const json = (await res.json()) as Reply | Reply[];
      return Array.isArray(json) ? json[0]! : json;
    },
    { path, type, input },
  );
}
