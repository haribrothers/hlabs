import type { AppHandlers } from '@hlabs/api';
import { hlabsError } from '@hlabs/api';
import { getAccount, updateAccount } from '../account/account';
import type { DaemonContext } from '../context';

const userOf = (ctx: DaemonContext) => {
  const id = ctx.identity;
  if (id.kind !== 'user' || !id.session) throw hlabsError('AUTH_REQUIRED');
  return id.userId;
};

export const account: AppHandlers<DaemonContext>['account'] = {
  get: (_input, ctx) => getAccount(ctx.services.db, userOf(ctx)),
  update: (input, ctx) => {
    updateAccount(ctx.services.db, userOf(ctx), input, { ip: ctx.request.ip });
    return { ok: true as const };
  },
};
