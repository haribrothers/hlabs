import type { AppHandlers } from '@hlabs/api';
import { hlabsError } from '@hlabs/api';
import type { DaemonContext } from '../context';
import { getLayout } from '../home/layout';
import { searchEverything } from '../home/search';

export const home: AppHandlers<DaemonContext>['home'] = {
  /** Widgets and apps in this person's order (US-HOME-02, US-HOME-03). */
  getLayout: (_input, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
    return getLayout(ctx.services.db, { id: id.userId, role: id.role });
  },
  /** Only what this person can open or do (US-HOME-10). */
  searchEverything: (input, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
    const { db, store, routing } = ctx.services;
    return searchEverything(
      { db, store, isPublished: (name) => routing.isPublished(name) },
      { id: id.userId, role: id.role },
      { query: input.query, limitPerGroup: input.limitPerGroup ?? 5 },
    );
  },
};
