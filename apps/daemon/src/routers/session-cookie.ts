// Setting and clearing the session cookie on the domain the dashboard was reached on (US-AUTH-14, US-AUTH-16).
import { getSetting } from '@hlabs/db';
import { clearedSessionCookie, cookieDomain, sessionCookie } from '../auth/sessions';
import type { DaemonContext } from '../context';

const domainFor = (ctx: DaemonContext) => cookieDomain(ctx.request.host, getSetting(ctx.services.db, 'hostname'));

export function setSessionCookie(
  ctx: DaemonContext,
  session: { raw: string; remember: boolean; expiresAt: number; issuedAt?: number },
) {
  ctx.request.setCookie(sessionCookie(session.raw, { ...session, now: session.issuedAt, domain: domainFor(ctx) }));
}

export function clearSessionCookie(ctx: DaemonContext) {
  ctx.request.setCookie(clearedSessionCookie(domainFor(ctx)));
}
