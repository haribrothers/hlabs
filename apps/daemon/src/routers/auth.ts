import type { AppHandlers } from '@hlabs/api';
import { hlabsError } from '@hlabs/api';
import { getSetting, users } from '@hlabs/db';
import { asc, eq, isNull } from 'drizzle-orm';
import { csrfTokenFor } from '../auth/sessions';
import type { DaemonContext } from '../context';

export const auth: AppHandlers<DaemonContext>['auth'] = {
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
