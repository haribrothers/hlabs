import type { AppHandlers } from '@hlabs/api';
import { hlabsError } from '@hlabs/api';
import { changePassword, getAccount, updateAccount } from '../account/account';
import type { DaemonContext } from '../context';

const userOf = (ctx: DaemonContext) => {
  const id = ctx.identity;
  if (id.kind !== 'user' || !id.session) throw hlabsError('AUTH_REQUIRED');
  return id.userId;
};

export const account: AppHandlers<DaemonContext>['account'] = {
  get: (_input, ctx) => getAccount(ctx.services.db, userOf(ctx)),
  changePassword: async (input, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user' || !id.session) throw hlabsError('AUTH_REQUIRED');
    await changePassword(ctx.services.db, ctx.services, { userId: id.userId, sessionId: id.session.id }, input, {
      ip: ctx.request.ip,
    });
    return { ok: true as const };
  },
  update: (input, ctx) => {
    updateAccount(ctx.services.db, userOf(ctx), input, { ip: ctx.request.ip });
    return { ok: true as const };
  },
};
