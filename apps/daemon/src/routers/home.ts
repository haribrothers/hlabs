import type { AppHandlers } from '@hlabs/api';
import { hlabsError } from '@hlabs/api';
import { users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import type { DaemonContext } from '../context';
import { appUpdatesOf } from '../store/updates-list';
import { getLayout, saveDock, saveLayout } from '../home/layout';
import { widgetCatalog } from '../home/widget-catalog';
import { widgetData } from '../home/widget-data';
import { searchEverything } from '../home/search';

export const home: AppHandlers<DaemonContext>['home'] = {
  /** Widgets and apps in this person's order (US-HOME-02, US-HOME-03). */
  getLayout: (_input, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
    return getLayout(ctx.services.db, { id: id.userId, role: id.role });
  },
  /** After edit mode (US-HOME-16…19): what this person may have, in their order. */
  saveLayout: (input, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
    return saveLayout(ctx.services.db, { id: id.userId, role: id.role }, input);
  },
  /** Pinned Dock apps (US-HOME-22). */
  saveDock: ({ appIds }, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
    return saveDock(ctx.services.db, { id: id.userId, role: id.role }, appIds);
  },
  /** The widget picker (US-HOME-19): hlabs's own for this person's role, and their apps' widgets. */
  listWidgets: (_input, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
    return widgetCatalog(ctx.services, { id: id.userId, role: id.role });
  },
  /** Widgets no other query serves (US-HOME-12, 19, 20); ids this person can't have are left out. */
  getWidgetData: async ({ widgetIds }, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
    const { db } = ctx.services;
    const user = db.select({ username: users.username }).from(users).where(eq(users.id, id.userId)).get();
    if (!user) throw hlabsError('AUTH_REQUIRED');
    const pendingUpdates = () =>
      appUpdatesOf(ctx.services).pending.map(({ appId, name, icon }) => ({ id: appId, name, icon }));
    return widgetData(
      { db, appWidgets: ctx.services.appWidgets, pendingUpdates },
      { id: id.userId, username: user.username, role: id.role },
      widgetIds,
    );
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
