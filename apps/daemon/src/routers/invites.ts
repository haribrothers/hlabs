import { hlabsError, type AppHandlers } from '@hlabs/api';
import type { DaemonContext } from '../context';
import { setSessionCookie } from './session-cookie';
import { acceptInvite } from '../invites/accept';
import { createInvite, inspectInvite, listPendingInvites, revokeInvite, updateInvite } from '../invites/invites';

/** The signed-in admin, for `created_by` and the audit log. */
const who = (ctx: DaemonContext) => {
  const id = ctx.identity;
  if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
  return { userId: id.userId, ip: ctx.request.ip };
};

export const invites: AppHandlers<DaemonContext>['invites'] = {
  /** Makes the account and signs it in on this browser, not remembered (US-AUTH-24). */
  accept: async (input, ctx) => {
    const { db, secrets, notifications, logger, sessions } = ctx.services;
    const { userId } = await acceptInvite({ db, secrets, notifications, logger }, input, ctx.request.ip);
    setSessionCookie(ctx, sessions.create({ userId, ip: ctx.request.ip, userAgent: ctx.request.userAgent }));
    // Home for both roles; two-factor setup first when the admin requires it (US-AUTH-10, the first-run gate).
    return { redirectTo: '/' };
  },
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
