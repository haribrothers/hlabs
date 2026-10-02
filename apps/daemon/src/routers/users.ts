import { hlabsError, type AppHandlers } from '@hlabs/api';
import type { DaemonContext } from '../context';
import { getUser, listUsers, setAppAccess } from '../users/users';

/** The signed-in admin, for the audit log. */
const who = (ctx: DaemonContext) => {
  const id = ctx.identity;
  if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
  return { userId: id.userId, ip: ctx.request.ip };
};

export const users: AppHandlers<DaemonContext>['users'] = {
  list: (_input, ctx) => ({ users: listUsers(ctx.services.db) }),
  get: ({ userId }, ctx) => getUser(ctx.services.db, userId),
  setAppAccess: (input, ctx) => {
    setAppAccess(ctx.services, input, who(ctx));
    return { ok: true as const };
  },
};
