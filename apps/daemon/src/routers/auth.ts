import type { AppHandlers } from '@hlabs/api';
import { hlabsCodeOf, hlabsError } from '@hlabs/api';
import { auditLog, getSetting, sessions, users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { asc, eq, isNull } from 'drizzle-orm';
import { appearanceFor } from '../account/appearance';
import { noteSignInPlace } from '../auth/new-place';
import { csrfTokenFor } from '../auth/sessions';
import { clearSessionCookie, setSessionCookie } from './session-cookie';
import type { DaemonContext } from '../context';
import { resetPassword } from '../users/reset-link';

/** Wrong passwords and codes, and the lockout: what counts toward the public limit per address (US-SYS-46). */
const FAILED_SIGN_IN = new Set([
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_TOTP_INVALID',
  'AUTH_RECOVERY_INVALID',
  'AUTH_LOCKED',
]);

/** An address refused after too many failed sign-ins on a public address: AUTH_LOCKED for the rest of the hour. */
const addressRefused = (until: number) =>
  hlabsError('AUTH_LOCKED', 'Too many failed sign-ins from this address', {
    retryAfterSeconds: Math.max(1, Math.ceil((until - Date.now()) / 1000)),
    address: true,
  });

/**
 * A sign-in step on the public dashboard (US-SYS-46, D-182): its public name (the session belongs to it only), once
 * the visitor's address isn't refused by the public limit; undefined at home or on the tailnet.
 */
function publicSignIn(ctx: DaemonContext): string | undefined {
  if (ctx.request.via !== 'public') return undefined;
  const host = ctx.request.publicHost;
  if (!host) throw hlabsError('NOT_FOUND');
  const until = ctx.services.publicApps.limiter.refusedUntil(ctx.request.ip, Date.now());
  if (until) throw addressRefused(until);
  return host;
}

/** On the public dashboard a failed step counts toward the address's limit; the one over it refuses the address. */
async function countingFailures<T>(ctx: DaemonContext, publicHost: string | undefined, work: () => Promise<T>) {
  try {
    return await work();
  } catch (err) {
    if (publicHost && FAILED_SIGN_IN.has(hlabsCodeOf(err))) {
      const { publicApps } = ctx.services;
      publicApps.dashboardSignInFailed(ctx.request.ip);
      const until = publicApps.limiter.refusedUntil(ctx.request.ip, Date.now());
      if (until) throw addressRefused(until);
    }
    throw err;
  }
}

/** After a sign-in on the public dashboard: a new place is told to the person (US-SYS-46). */
function afterPublicSignIn(ctx: DaemonContext, publicHost: string | undefined, userId: string) {
  if (!publicHost) return;
  noteSignInPlace(ctx.services.db, ctx.services.bus, {
    userId,
    ip: ctx.request.ip,
    country: ctx.request.country,
    publicHost,
  });
}

export const auth: AppHandlers<DaemonContext>['auth'] = {
  /**
   * A new password from an admin's one-time link (US-ACCT-14, US-AUTH-22). Signs them out everywhere, then in on this
   * device, unless they have two-factor: a link alone mustn't skip it, so they log in with the new password (D-114).
   */
  resetPassword: async (input, ctx) => {
    const { origin, allowedOrigins, ip, userAgent } = ctx.request;
    if (origin !== null && !allowedOrigins.includes(origin)) throw hlabsError('CSRF_REJECTED');
    const { userId } = await resetPassword(ctx.services, input, ip);
    const { db, sessions: service, totp } = ctx.services;
    const username = db.select({ username: users.username }).from(users).where(eq(users.id, userId)).get()!.username;
    if (totp.isEnabled(userId)) return { loggedIn: false, username };
    setSessionCookie(ctx, service.create({ userId, remember: false, ip, userAgent }));
    return { loggedIn: true, username };
  },
  /**
   * Sign out one of my devices (US-ACCT-05): only my own sessions; already ended ones are fine (idempotent). The
   * device hears `session.revoked` and goes to log in.
   */
  revokeSession: ({ sessionId }, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user' || !id.session) throw hlabsError('AUTH_REQUIRED');
    const { db, sessions: service } = ctx.services;
    const row = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    if (!row || row.userId !== id.userId) throw hlabsError('NOT_FOUND');
    const ended = service.revoke({ sessionId });
    if (ended.length > 0) {
      db.insert(auditLog)
        .values({
          id: ulid(),
          at: Date.now(),
          userId: id.userId,
          action: 'session.revoke',
          target: sessionId,
          detailJson: null,
          ip: ctx.request.ip,
        })
        .run();
    }
    return { ok: true as const };
  },
  /** My signed-in devices (US-ACCT-04): only the caller's sessions. */
  listSessions: (_input, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user' || !id.session) throw hlabsError('AUTH_REQUIRED');
    const dashboard = getSetting(ctx.services.db, 'public').dashboard?.hostname.toLowerCase() ?? null;
    return {
      items: ctx.services.sessions
        .listFor(id.userId, id.session.id)
        .map((s) => ({ ...s, publicDashboard: s.publicHost !== null && s.publicHost === dashboard })),
    };
  },
  /**
   * "Sign out everywhere" (US-SYS-46): every session of mine but this one ends, wherever it was signed in; each device
   * hears `session.revoked`. Works from the public dashboard too.
   */
  revokeOtherSessions: (_input, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user' || !id.session) throw hlabsError('AUTH_REQUIRED');
    const ended = ctx.services.sessions.revoke({ userId: id.userId, except: id.session.id });
    ctx.services.db
      .insert(auditLog)
      .values({
        id: ulid(),
        at: Date.now(),
        userId: id.userId,
        action: 'session.revokeOthers',
        target: id.userId,
        detailJson: { ended: ended.length },
        ip: ctx.request.ip,
      })
      .run();
    return { ended: ended.length };
  },
  /**
   * Log out (US-AUTH-16): this session only; the cookie is cleared on the domain it was set on, so app hostnames'
   * next forward-auth check fails too. Other devices stay signed in.
   */
  logout: (_input, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user' || !id.session) throw hlabsError('AUTH_REQUIRED');
    const { sessions, db } = ctx.services;
    sessions.revoke({ sessionId: id.session.id });
    db.insert(auditLog)
      .values({
        id: ulid(),
        at: Date.now(),
        userId: id.userId,
        action: 'auth.logout',
        target: id.userId,
        detailJson: null,
        ip: ctx.request.ip,
      })
      .run();
    clearSessionCookie(ctx);
    return { ok: true as const };
  },
  /** A recovery code instead of the two-factor code (US-AUTH-09). */
  useRecoveryCode: async ({ challengeId, code }, ctx) => {
    const { origin, allowedOrigins, ip, userAgent } = ctx.request;
    if (origin !== null && !allowedOrigins.includes(origin)) throw hlabsError('CSRF_REJECTED');
    const publicHost = publicSignIn(ctx);
    const userId = ctx.services.login.challenge(challengeId)?.userId;
    const { session, redirectTo, recoveryCodesLeft } = await countingFailures(ctx, publicHost, () =>
      ctx.services.login.useRecoveryCode({ challengeId, code, ip, userAgent, publicHost }),
    );
    setSessionCookie(ctx, session);
    if (userId) afterPublicSignIn(ctx, publicHost, userId);
    return { redirectTo, recoveryCodesLeft };
  },
  /** The two-factor step of a log-in (US-AUTH-08). */
  verifyTotp: async ({ challengeId, code }, ctx) => {
    const { origin, allowedOrigins, ip, userAgent } = ctx.request;
    if (origin !== null && !allowedOrigins.includes(origin)) throw hlabsError('CSRF_REJECTED');
    const publicHost = publicSignIn(ctx);
    const userId = ctx.services.login.challenge(challengeId)?.userId;
    const { session, redirectTo } = await countingFailures(ctx, publicHost, () =>
      ctx.services.login.verifyTotp({ challengeId, code, ip, userAgent, publicHost }),
    );
    setSessionCookie(ctx, session);
    if (userId) afterPublicSignIn(ctx, publicHost, userId);
    return { redirectTo };
  },
  /**
   * Username and password (US-AUTH-03). Public, but only from the dashboard's own origin. Two-factor accounts get a
   * challenge instead of a session (US-AUTH-08). On the public dashboard (US-SYS-46) two-factor is always asked
   * (AUTH_TWO_FACTOR_REQUIRED without it, and no session), there's no "Remember me", the session belongs to that
   * address only and ends after 12 hours, and failures count toward the address's limit too.
   */
  login: async ({ username, password, remember, next }, ctx) => {
    const { origin, allowedOrigins, ip, userAgent } = ctx.request;
    if (origin !== null && !allowedOrigins.includes(origin)) throw hlabsError('CSRF_REJECTED');
    const publicHost = publicSignIn(ctx);
    const result = await countingFailures(ctx, publicHost, () =>
      ctx.services.login.login({
        username,
        password,
        remember: publicHost ? false : (remember ?? false),
        next,
        ip,
        userAgent,
        publicHost,
      }),
    );
    if (result.kind === 'totp') return { status: 'totp_required' as const, challengeId: result.challengeId };
    if (result.kind === 'twoFactorRequired') throw hlabsError('AUTH_TWO_FACTOR_REQUIRED');
    setSessionCookie(ctx, result.session);
    return { status: 'ok' as const, redirectTo: result.redirectTo };
  },
  /**
   * Enabled users for the log-in screen (US-AUTH-01): admins first, then members, each by display name. Empty when
   * an admin hides the list; the server enforces that, not the UI (US-AUTH-02).
   */
  listLoginUsers: (_input, ctx) => {
    const { db } = ctx.services;
    // Never on the public dashboard: strangers don't learn who uses hlabs (US-SYS-46).
    const via = ctx.request.via;
    if (via === 'public') return { users: [], via };
    if (!getSetting(db, 'people').showUserList) return { users: [], via };
    const rows = db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        role: users.role,
        avatarColor: users.avatarColor,
      })
      .from(users)
      .where(isNull(users.disabledAt))
      .orderBy(asc(users.displayName))
      .all();
    const byName = (a: { displayName: string }, b: { displayName: string }) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
    return {
      users: [
        ...rows.filter((u) => u.role === 'admin').sort(byName),
        ...rows.filter((u) => u.role !== 'admin').sort(byName),
      ],
      via,
    };
  },

  /** The signed-in user and the CSRF token for mutations. Needs a real session (07 §7.3). */
  continue: ({ next }, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user' || !id.session) throw hlabsError('AUTH_REQUIRED');
    const row = ctx.services.db.select().from(sessions).where(eq(sessions.id, id.session.id)).get();
    if (!row) throw hlabsError('AUTH_REQUIRED');
    setSessionCookie(ctx, { raw: id.session.raw, remember: id.session.remember, expiresAt: row.expiresAt });
    return { redirectTo: ctx.services.login.redirectFor(next) };
  },
  me: (_input, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user' || !id.session) throw hlabsError('AUTH_REQUIRED');
    const user = ctx.services.db.select().from(users).where(eq(users.id, id.userId)).get();
    if (!user) throw hlabsError('AUTH_REQUIRED');
    const totpEnabled = ctx.services.totp.isEnabled(user.id);
    const people = getSetting(ctx.services.db, 'people');
    const admin = user.role === 'admin';
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      avatarColor: user.avatarColor,
      locale: user.locale,
      // The admin requires two-factor and this account hasn't set it up yet (US-AUTH-10).
      mustSetupTotp: getSetting(ctx.services.db, 'people').requireTotp && !totpEnabled,
      totpEnabled,
      canSeeUsage: admin || (people.membersCanSeeUsage && user.canSeeUsage),
      canInstallApps: admin || people.membersCanInstall,
      canSeeShared: admin || user.canSeeShared,
      // Whether this session was started with "Remember me", so this device can reuse the choice (US-AUTH-14).
      remember: id.session.remember,
      appearance: appearanceFor(ctx.services.db, user.id),
      csrfToken: csrfTokenFor(id.session.raw),
      via: ctx.request.via,
    };
  },
};
