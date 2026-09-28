import type { AppHandlers } from '@hlabs/api';
import { hlabsError } from '@hlabs/api';
import type { DaemonContext } from '../context';
import { getLayout } from '../home/layout';

export const home: AppHandlers<DaemonContext>['home'] = {
  /** Widgets and apps in this person's order (US-HOME-02, US-HOME-03). */
  getLayout: (_input, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
    return getLayout(ctx.services.db, { id: id.userId, role: id.role });
  },
};
