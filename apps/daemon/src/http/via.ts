// Where a request came from (US-SYS-46, US-SYS-47; D-182, 07 §7.11): one decision for the tRPC context and the HTTP
// routes. `public` only from `X-Hlabs-Via: public`, which Caddy's public listener sets on the dashboard's public name and
// every other Caddy server deletes, so nobody at home can pass as the internet (and claiming it only takes things
// away: home-only changes are refused, and only a session made there counts). `tailnet` from the dashboard's tailnet
// name (Tailscale Serve sends it straight to the daemon); anything else is `home`.
import { getSetting, type HlabsDb } from '@hlabs/db';
import type { Via } from '@hlabs/shared';
import type { FastifyRequest } from 'fastify';
import { readCookie, SESSION_COOKIE, type ResolvedSession } from '../auth/sessions';
import { tailnetHost } from '../network/domains';
import type { Services } from '../services';

export type { Via };

type Headers = FastifyRequest['headers'];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;
const bare = (host: string | null) => host?.replace(/:\d+$/, '').toLowerCase() ?? null;

/** The request came through the public listener's dashboard route (`X-Hlabs-Via: public`). */
export function cameFromPublic(headers: Headers): boolean {
  return first(headers['x-hlabs-via'])?.trim().toLowerCase() === 'public';
}

/** `public`, `tailnet` or `home` (see above). */
export function viaOf(headers: Headers, db: HlabsDb | null): Via {
  if (cameFromPublic(headers)) return 'public';
  const tailnet = db ? tailnetHost(db) : null;
  const host = bare(first(headers['x-forwarded-host']) ?? first(headers.host));
  if (tailnet && host === tailnet.toLowerCase()) return 'tailnet';
  return 'home';
}

/**
 * Cloudflare's two-letter country for the visitor (`CF-IPCountry`, which Cloudflare sets on every request through the
 * tunnel); null when it doesn't know (`XX`) or didn't say. Only believed for a request from the public listener.
 */
export function countryOf(headers: Headers): string | null {
  if (!cameFromPublic(headers)) return null;
  const code = first(headers['cf-ipcountry'])?.trim().toUpperCase() ?? '';
  return /^[A-Z][A-Z0-9]$/.test(code) && code !== 'XX' ? code : null;
}

/** The dashboard's public name while it's public (`hlabs.example.com`), else null. */
export function publicDashboardHost(db: HlabsDb): string | null {
  return getSetting(db, 'public').dashboard?.hostname.toLowerCase() ?? null;
}

/**
 * For a request from the public listener: the dashboard's public name it came to, when that is the dashboard's name
 * now; null otherwise (a name made private a moment ago, or not from the public listener).
 */
export function publicHostFor(headers: Headers, db: HlabsDb | null): string | null {
  if (!db || !cameFromPublic(headers)) return null;
  const host = bare(first(headers['x-hlabs-public-host']));
  const dashboard = publicDashboardHost(db);
  return host && host === dashboard ? host : null;
}

/**
 * The signed-in session for a dashboard request: from home or the tailnet a session made there (never one bound to a
 * public name); from the public dashboard only a session made on that name, which ends 12 hours after it began however
 * active it is, and only while the person still has two-factor (US-SYS-46).
 */
export function dashboardSession(
  services: Services,
  headers: Headers,
  raw: string | null = readCookie(headers.cookie, SESSION_COOKIE),
  now = Date.now(),
): ResolvedSession | null {
  if (!raw) return null;
  if (!cameFromPublic(headers)) return services.sessions.resolve(raw, now);
  const publicHost = publicHostFor(headers, services.db);
  if (!publicHost) return null;
  const session = services.sessions.resolve(raw, now, { publicHost, absolute: true });
  if (!session || !services.totp.isEnabled(session.userId)) return null;
  return session;
}

/** The development-only anonymous admin, never for a request from the public dashboard. */
export function anonymousAdmin(devAnonymousAdmin: boolean, headers: Headers): boolean {
  return devAnonymousAdmin && !cameFromPublic(headers);
}
