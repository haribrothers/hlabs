import type { AppHandlers } from '@hlabs/api';
import { hlabsError } from '@hlabs/api';
import { users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import type { DaemonContext } from '../context';
import { getLayout } from '../home/layout';
import { widgetData } from '../home/widget-data';
import { searchEverything } from '../home/search';

export const home: AppHandlers<DaemonContext>['home'] = {
  /** Widgets and apps in this person's order (US-HOME-02, US-HOME-03). */
  getLayout: (_input, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
    return getLayout(ctx.services.db, { id: id.userId, role: id.role });
  },
  /** "My files" and "Shared with you" (US-HOME-12); unknown ids are left out. */
  getWidgetData: ({ widgetIds }, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
    const { db } = ctx.services;
    const user = db.select({ username: users.username }).from(users).where(eq(users.id, id.userId)).get();
    if (!user) throw hlabsError('AUTH_REQUIRED');
    return widgetData(db, { id: id.userId, username: user.username, role: id.role }, widgetIds);
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
