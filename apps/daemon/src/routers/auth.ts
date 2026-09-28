import type { AppHandlers } from '@hlabs/api';
import { hlabsError } from '@hlabs/api';
import { getSetting, users } from '@hlabs/db';
import { asc, eq, isNull } from 'drizzle-orm';
import { csrfTokenFor, sessionCookie } from '../auth/sessions';
import type { DaemonContext } from '../context';

export const auth: AppHandlers<DaemonContext>['auth'] = {
  /** The two-factor step of a log-in (US-AUTH-08). */
  verifyTotp: async ({ challengeId, code }, ctx) => {
    const { origin, allowedOrigins, ip, userAgent } = ctx.request;
    if (origin !== null && !allowedOrigins.includes(origin)) throw hlabsError('CSRF_REJECTED');
    const { session, redirectTo } = await ctx.services.login.verifyTotp({ challengeId, code, ip, userAgent });
    ctx.request.setCookie(sessionCookie(session.raw, session));
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
    ctx.request.setCookie(sessionCookie(result.session.raw, result.session));
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
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      avatarColor: user.avatarColor,
      locale: user.locale,
      // Admin-required two-factor arrives with US-AUTH-10.
      mustSetupTotp: false,
      totpEnabled: ctx.services.totp.isEnabled(user.id),
      appearance: null,
      csrfToken: csrfTokenFor(id.session.raw),
    };
  },
};
