import type { AppHandlers } from '@hlabs/api';
import { hlabsError } from '@hlabs/api';
import { users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { csrfTokenFor } from '../auth/sessions';
import type { DaemonContext } from '../context';

export const auth: AppHandlers<DaemonContext>['auth'] = {
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
      appearance: null,
      csrfToken: csrfTokenFor(id.session.raw),
    };
  },
};
