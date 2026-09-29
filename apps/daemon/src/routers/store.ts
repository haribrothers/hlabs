import type { AppHandlers } from '@hlabs/api';
import { hlabsError } from '@hlabs/api';
import { users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import type { DaemonContext } from '../context';

/** The signed-in user who may browse the store (US-STORE-01: members only with "Members can install apps"). */
function browser(ctx: DaemonContext) {
  const id = ctx.identity;
  if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
  ctx.services.store.assertCanBrowse(id);
  return id;
}

export const store: AppHandlers<DaemonContext>['store'] = {
  getHome: (_input, ctx) => {
    browser(ctx);
    return ctx.services.store.getHome();
  },
  listApps: (input, ctx) => {
    browser(ctx);
    return ctx.services.store.listApps(input);
  },
  getApp: (input, ctx) => {
    const id = browser(ctx);
    const user = ctx.services.db.select({ username: users.username }).from(users).where(eq(users.id, id.userId)).get();
    return ctx.services.store.getApp(input.appId, { username: user?.username ?? '', role: id.role });
  },
  listCategories: (_input, ctx) => {
    browser(ctx);
    return ctx.services.store.listCategories();
  },
};
