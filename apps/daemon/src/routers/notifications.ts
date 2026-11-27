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
  unreadCount: (_input, ctx) => ({ count: ctx.services.notifications.unreadCount(readerOf(ctx)) }),
  markRead: ({ ids }, ctx) => {
    ctx.services.notifications.markRead(readerOf(ctx), ids);
    return { ok: true };
  },
  markAllRead: (_input, ctx) => {
    ctx.services.notifications.markAllRead(readerOf(ctx));
    return { ok: true };
  },
  dismiss: ({ ids }, ctx) => {
    ctx.services.notifications.dismiss(readerOf(ctx), ids);
    return { ok: true };
  },
};
