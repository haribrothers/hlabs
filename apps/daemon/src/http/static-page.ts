// Pages the daemon answers with outside the dashboard (US-AUTH-17, US-AUTH-19): "Page not found" and "You don't have
// access to this" for app hostnames. They come from the fallback bundle (`pages.html`, built by apps/web with the
// dashboard's copy and styles, everything inlined), and the daemon adds the page's data as JSON. Without the bundle
// (tests, `pnpm dev` before a build) a plain page says the same.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface NoAccessPage {
  kind: 'noAccess';
  homeUrl: string;
  appName: string;
  /** The oldest enabled admin, to ask; null if there's none. */
  adminName: string | null;
  username: string;
  displayName: string;
  avatarColor: string | null;
  /** The member's accent (Settings › Appearance). */
  accent: string;
  /**
   * On a public app's address (`photos.example.com`, D-178): the dashboard isn't reachable there, so the page offers
   * "Sign out" (a form posting to `/.hlabs/sign-out`) instead of Home. Absent on home addresses.
   */
  publicHost?: string;
}

/** The app's tile on a public address: its gradient and Lucide icon (its logo is served on home addresses only). */
export interface PublicAppIcon {
  gradient: [string, string] | null;
  fallback: string | null;
}

/**
 * hlabs's sign-in on a public app's address (`/.hlabs/sign-in`, D-178; the PublicSignIn screen). The page posts forms
 * back to `/.hlabs/sign-in` (application/x-www-form-urlencoded): `username`, `password` and `next` for the first step;
 * `challenge` with `code` (6 digits) or `recoveryCode` and `next` for the second. No requests of its own.
 */
export interface PublicSignInPage {
  kind: 'publicSignIn';
  /**
   * `password`: username and password; `code`: the 6-digit code (or a recovery code); `no2fa`: "Turn on two-factor
   * login first" (with Back to `password`); `tooManyTries`: this address is refused for now (`retryAfterSeconds`).
   */
  step: 'password' | 'code' | 'no2fa' | 'tooManyTries';
  appName: string;
  icon: PublicAppIcon;
  /** The public address's name ("Protected by hlabs · photos.example.com"). */
  host: string;
  /** Where to go once signed in: a path on this address. */
  next: string;
  /** The username typed, kept for another try and the code step. */
  username: string | null;
  /** The code step's challenge, posted back with the code. */
  challenge: string | null;
  /**
   * `invalid`: wrong username or password (password step) or wrong code (code step); `expired`: the code step took over
   * 5 minutes, sign in again; `locked`: hlabs's lockout for this username (07 §7.2, `retryAfterSeconds`).
   */
  error: 'invalid' | 'expired' | 'locked' | null;
  retryAfterSeconds: number | null;
}

/** `GET /.hlabs/sign-out`: "Sign out of <App>?" with a button posting to `/.hlabs/sign-out`. */
export interface PublicSignOutPage {
  kind: 'publicSignOut';
  appName: string;
  icon: PublicAppIcon;
  host: string;
}

/** A public app that isn't running (or its engine stopped): "<App> isn't running" (US-APP-27), nothing more said. */
export interface AppNotRunningPage {
  kind: 'appNotRunning';
  appName: string;
  icon: PublicAppIcon;
  host: string;
}

export type StaticPageData =
  | { kind: 'notFound'; homeUrl: string }
  | { kind: 'engineStopped'; homeUrl: string }
  | NoAccessPage
  | PublicSignInPage
  | PublicSignOutPage
  | AppNotRunningPage;

export const PAGES_FILE = 'pages.html';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** JSON that is safe inside a <script> element. */
const scriptJson = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');

export class StaticPages {
  private template: string | null | undefined;

  constructor(private readonly webFallbackDir: string) {}

  render(data: StaticPageData): string {
    const template = this.load();
    const json = `<script id="hlabs-page" type="application/json">${scriptJson(data)}</script>`;
    if (template) return template.replace('</head>', () => `${json}\n</head>`);
    // Plain version: the bundle isn't built here.
    if (data.kind === 'publicSignIn' || data.kind === 'publicSignOut' || data.kind === 'appNotRunning')
      return plainPublicPage(data, json);
    const title =
      data.kind === 'notFound'
        ? 'Page not found'
        : data.kind === 'engineStopped'
          ? 'The container engine has stopped'
          : "You don't have access to this";
    const action =
      data.kind === 'noAccess' && data.publicHost
        ? `<form method="post" action="/.hlabs/sign-out"><button>Sign out</button></form>`
        : `<p><a href="${escapeHtml(data.homeUrl)}">Go to Home</a></p>`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>${json}</head><body><h1>${title}</h1>${action}</body></html>`;
  }

  private load(): string | null {
    if (this.template === undefined) {
      try {
        this.template = readFileSync(join(this.webFallbackDir, PAGES_FILE), 'utf8');
      } catch {
        this.template = null;
      }
    }
    return this.template;
  }
}

/**
 * The public pages without the bundle (tests, `pnpm dev` before a build): unstyled, but every step works, with the
 * same form fields the bundle's pages post.
 */
function plainPublicPage(data: PublicSignInPage | PublicSignOutPage | AppNotRunningPage, json: string): string {
  const e = escapeHtml;
  const head = (title: string) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(title)}</title>${json}</head><body>`;
  const foot = `<p>Protected by hlabs · ${e(data.host)}</p></body></html>`;
  if (data.kind === 'appNotRunning')
    return `${head(`${data.appName} isn't running`)}<h1>${e(data.appName)} isn't running</h1>${foot}`;
  if (data.kind === 'publicSignOut')
    return `${head(`Sign out of ${data.appName}`)}<h1>Sign out of ${e(data.appName)}?</h1><form method="post" action="/.hlabs/sign-out"><button>Sign out</button></form>${foot}`;
  const title = `Sign in to open ${data.appName}`;
  const next = `<input type="hidden" name="next" value="${e(data.next)}">`;
  const error =
    data.error === 'invalid'
      ? data.step === 'code'
        ? '<p role="alert">That code didn\'t work. Try the newest one.</p>'
        : '<p role="alert">That username or password is wrong. Check them and try again.</p>'
      : data.error === 'expired'
        ? '<p role="alert">That took too long. Sign in again.</p>'
        : data.error === 'locked'
          ? `<p role="alert">Too many tries. Try again in ${Math.ceil((data.retryAfterSeconds ?? 60) / 60)} minutes.</p>`
          : '';
  let body: string;
  switch (data.step) {
    case 'password':
      body = `<form method="post" action="/.hlabs/sign-in">${next}<label>Username <input name="username" autocomplete="username" value="${e(data.username ?? '')}"></label><label>Password <input name="password" type="password" autocomplete="current-password"></label><button>Continue</button></form>`;
      break;
    case 'code':
      body = `<form method="post" action="/.hlabs/sign-in">${next}<input type="hidden" name="challenge" value="${e(data.challenge ?? '')}"><label>6-digit code <input name="code" inputmode="numeric" autocomplete="one-time-code"></label><button>Verify</button></form><form method="post" action="/.hlabs/sign-in">${next}<input type="hidden" name="challenge" value="${e(data.challenge ?? '')}"><label>Recovery code <input name="recoveryCode" autocomplete="off"></label><button>Use a recovery code</button></form>`;
      break;
    case 'no2fa':
      body = `<p role="alert">Turn on two-factor login first. Opening ${e(data.appName)} from the internet needs it.</p><p><a href="/.hlabs/sign-in?next=${encodeURIComponent(data.next)}">Back</a></p>`;
      break;
    case 'tooManyTries':
      body = `<p role="alert">Too many tries from your address. Try again in ${Math.ceil((data.retryAfterSeconds ?? 3600) / 60)} minutes.</p>`;
      break;
  }
  return `${head(title)}<h1>${e(title)}</h1>${error}${body}${foot}`;
}
