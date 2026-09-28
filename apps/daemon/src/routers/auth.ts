import type { AppHandlers } from '@hlabs/api';
import { hlabsError } from '@hlabs/api';
import { auditLog, getSetting, getUserSetting, users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { asc, eq, isNull } from 'drizzle-orm';
import { csrfTokenFor } from '../auth/sessions';
import { clearSessionCookie, setSessionCookie } from './session-cookie';
import type { DaemonContext } from '../context';

export const auth: AppHandlers<DaemonContext>['auth'] = {
  /** My signed-in devices (US-ACCT-04): only the caller's sessions. */
  listSessions: (_input, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user' || !id.session) throw hlabsError('AUTH_REQUIRED');
    return { items: ctx.services.sessions.listFor(id.userId, id.session.id) };
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
    const { session, redirectTo, recoveryCodesLeft } = await ctx.services.login.useRecoveryCode({
      challengeId,
      code,
      ip,
      userAgent,
    });
    setSessionCookie(ctx, session);
    return { redirectTo, recoveryCodesLeft };
  },
  /** The two-factor step of a log-in (US-AUTH-08). */
  verifyTotp: async ({ challengeId, code }, ctx) => {
    const { origin, allowedOrigins, ip, userAgent } = ctx.request;
    if (origin !== null && !allowedOrigins.includes(origin)) throw hlabsError('CSRF_REJECTED');
    const { session, redirectTo } = await ctx.services.login.verifyTotp({ challengeId, code, ip, userAgent });
    setSessionCookie(ctx, session);
    return { redirectTo };
  },
  /**
   * Username and password (US-AUTH-03). Public, but only from the dashboard's own origin. Two-factor accounts get a
   * challenge instead of a session (US-AUTH-08).
   */
  login: async ({ username, password, remember, next }, ctx) => {
    const { origin, allowedOrigins, ip, userAgent } = ctx.request;
    if (origin !== null && !allowedOrigins.includes(origin)) throw hlabsError('CSRF_REJECTED');
    const result = await ctx.services.login.login({
      username,
      password,
      remember: remember ?? false,
      next,
      ip,
      userAgent,
    });
    if (result.kind === 'totp') return { status: 'totp_required' as const, challengeId: result.challengeId };
    setSessionCookie(ctx, result.session);
    return { status: 'ok' as const, redirectTo: result.redirectTo };
  },
  /**
   * Enabled users for the log-in screen (US-AUTH-01): admins first, then members, each by display name. Empty when
   * an admin hides the list; the server enforces that, not the UI (US-AUTH-02).
   */
  listLoginUsers: (_input, ctx) => {
    const { db } = ctx.services;
    if (!getSetting(db, 'people').showUserList) return { users: [] };
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
    };
  },

  /** The signed-in user and the CSRF token for mutations. Needs a real session (07 §7.3). */
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
      // Whether this session was started with "Remember me", so this device can reuse the choice (US-AUTH-14).
      remember: id.session.remember,
      appearance: getUserSetting(ctx.services.db, 'appearance', user.id),
      csrfToken: csrfTokenFor(id.session.raw),
    };
  },
};
