import type { AppHandlers } from '@hlabs/api';
import { hlabsError } from '@hlabs/api';
import { auditLog, users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import type { DaemonContext } from '../context';
import { appUpdatesOf } from '../store/updates-list';

/** The signed-in user who may browse the store (US-STORE-01: members only with "Members can install apps"). */
function browser(ctx: DaemonContext) {
  const id = ctx.identity;
  if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
  ctx.services.store.assertCanBrowse(id);
  return id;
}

/** An admin's change to the sources, in audit_log. */
function audit(ctx: DaemonContext, action: string, target: string, detail: Record<string, unknown> | null = null) {
  const id = ctx.identity;
  ctx.services.db
    .insert(auditLog)
    .values({
      id: ulid(),
      at: Date.now(),
      userId: id.kind === 'user' ? id.userId : null,
      action,
      target,
      detailJson: detail,
      ip: ctx.request.ip,
    })
    .run();
}

export const store: AppHandlers<DaemonContext>['store'] = {
  /** US-STORE-15, US-SYS-25: updates waiting, rolled back and finished in the last 14 days. */
  listUpdates: (_input, ctx) => appUpdatesOf(ctx.services),
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
  sources: {
    list: (_input, ctx) => ({ sources: ctx.services.sources.list() }),
    inspect: (input, ctx) => ctx.services.sources.inspect(input.url),
    add: async (input, ctx) => {
      const res = await ctx.services.sources.add({ url: input.url, keyFingerprint: input.keyFingerprint });
      const view = ctx.services.sources.view(res.sourceId);
      audit(ctx, 'store.source.added', res.sourceId, { url: view.url, signed: view.signed, key: view.keyFingerprint });
      return res;
    },
    remove: (input, ctx) => {
      const view = ctx.services.sources.view(input.sourceId);
      ctx.services.sources.remove(input.sourceId);
      audit(ctx, 'store.source.removed', input.sourceId, { url: view.url });
      return { ok: true as const };
    },
    sync: async (input, ctx) => {
      if (input.sourceId) await ctx.services.sources.sync(input.sourceId);
      else await ctx.services.sources.syncAll();
      return { sources: ctx.services.sources.list() };
    },
  },
  copyToLibrary: async (input, ctx) => {
    const res = await ctx.services.sources.copyToLibrary(input);
    audit(ctx, 'store.copy_to_library', input.appId, { library: input.libraryId, newId: input.newId, as: res.kind });
    return res;
  },
  listCategories: (_input, ctx) => {
    browser(ctx);
    return ctx.services.store.listCategories();
  },
};
