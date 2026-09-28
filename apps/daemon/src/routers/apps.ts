import type { AppHandlers } from '@hlabs/api';
import { hlabsError } from '@hlabs/api';
import { listApps } from '../apps/list';
import type { DaemonContext } from '../context';

export const apps: AppHandlers<DaemonContext>['apps'] = {
  /** Only the apps this person can open, enforced here, not in the UI (07 §7.4). */
  list: (_input, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
    return listApps(ctx.services.db, { id: id.userId, role: id.role });
  },
};
