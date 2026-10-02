import type { AppHandlers } from '@hlabs/api';
import type { DaemonContext } from '../context';
import { listPendingInvites } from '../invites/invites';

export const invites: AppHandlers<DaemonContext>['invites'] = {
  list: async (_input, ctx) => ({ invites: await listPendingInvites(ctx.services.db, ctx.services.secrets) }),
};
