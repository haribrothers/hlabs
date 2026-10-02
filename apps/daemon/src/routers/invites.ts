import { hlabsError, type AppHandlers } from '@hlabs/api';
import type { DaemonContext } from '../context';
import { createInvite, inspectInvite, listPendingInvites, revokeInvite, updateInvite } from '../invites/invites';

/** The signed-in admin, for `created_by` and the audit log. */
const who = (ctx: DaemonContext) => {
  const id = ctx.identity;
  if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
  return { userId: id.userId, ip: ctx.request.ip };
};

export const invites: AppHandlers<DaemonContext>['invites'] = {
  inspect: ({ token }, ctx) => inspectInvite(ctx.services.db, token),
  list: async (_input, ctx) => ({ invites: await listPendingInvites(ctx.services.db, ctx.services.secrets) }),
  create: (input, ctx) => createInvite(ctx.services.db, ctx.services.secrets, input, who(ctx)),
  update: (input, ctx) => {
    updateInvite(ctx.services.db, input);
    return { ok: true as const };
  },
  revoke: async ({ inviteId }, ctx) => {
    await revokeInvite(ctx.services.db, ctx.services.secrets, inviteId, who(ctx));
    return { ok: true as const };
  },
};
