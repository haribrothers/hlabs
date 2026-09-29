import { hlabsError, type AppHandlers } from '@hlabs/api';
import type { DaemonContext } from '../context';
import type { Reader } from '../notifications/service';

/** Who is asking, as the event stream sees them. */
function readerOf(ctx: DaemonContext): Reader {
  const listener = ctx.listener;
  if (listener.kind !== 'user') throw hlabsError('ACCESS_DENIED');
  return { userId: listener.userId, role: listener.role };
}

export const notifications: AppHandlers<DaemonContext>['notifications'] = {
  list: (input, ctx) => ctx.services.notifications.list(readerOf(ctx), input),
  markRead: ({ ids }, ctx) => {
    ctx.services.notifications.markRead(readerOf(ctx), ids);
    return { ok: true };
  },
};
