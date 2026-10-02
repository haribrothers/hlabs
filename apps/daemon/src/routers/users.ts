import { hlabsError, type AppHandlers } from '@hlabs/api';
import type { DaemonContext } from '../context';
import { createResetLink } from '../users/reset-link';
import {
  deleteUser,
  disableUser,
  enableUser,
  getPolicy,
  getUser,
  updatePolicy,
  listUsers,
  setAppAccess,
  updateRole,
} from '../users/users';

/** The signed-in admin, for the audit log. */
const who = (ctx: DaemonContext) => {
  const id = ctx.identity;
  if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
  return { userId: id.userId, ip: ctx.request.ip };
};

export const users: AppHandlers<DaemonContext>['users'] = {
  list: (_input, ctx) => ({ users: listUsers(ctx.services.db) }),
  get: ({ userId }, ctx) => getUser(ctx.services.db, userId),
  updateRole: (input, ctx) => {
    updateRole(ctx.services, input, who(ctx));
    return { ok: true as const };
  },
  disable: ({ userId }, ctx) => {
    disableUser(ctx.services, userId, who(ctx));
    return { ok: true as const };
  },
  enable: ({ userId }, ctx) => {
    enableUser(ctx.services.db, userId, who(ctx));
    return { ok: true as const };
  },
  resetPasswordLink: ({ userId }, ctx) => createResetLink(ctx.services.db, userId, who(ctx)),
  delete: ({ userId, deleteHomeFolder }, ctx) =>
    deleteUser(ctx.services, { userId, deleteHomeFolder: deleteHomeFolder ?? false }, who(ctx)),
  getPolicy: (_input, ctx) => getPolicy(ctx.services.db),
  updatePolicy: (input, ctx) => updatePolicy(ctx.services, input, who(ctx)),
  setAppAccess: (input, ctx) => {
    setAppAccess(ctx.services, input, who(ctx));
    return { ok: true as const };
  },
};
