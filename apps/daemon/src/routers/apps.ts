import type { AppHandlers } from '@hlabs/api';
import { hlabsError } from '@hlabs/api';
import { listApps } from '../apps/list';
import { appUpdatesOf } from '../store/updates-list';
import { auditLog } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { widgetKeyRef } from '../home/app-widgets';
import { appWidgetsOf, visibleAppIds } from '../home/layout';
import type { DaemonContext } from '../context';

/** The signed-in person, as an installer. */
function installer(ctx: DaemonContext) {
  const id = ctx.identity;
  if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
  return { userId: id.userId, role: id.role, ip: ctx.request.ip };
}

export const apps: AppHandlers<DaemonContext>['apps'] = {
  /** Members get only the apps they can open (07 §7.4). */
  get: async (input, ctx) => {
    const user = installer(ctx);
    if (
      user.role !== 'admin' &&
      !visibleAppIds(ctx.services.db, { id: user.userId, role: user.role }).includes(input.appId)
    ) {
      throw hlabsError('ACCESS_DENIED');
    }
    const detail = await ctx.services.installer.detail(input.appId);
    const admin = user.role === 'admin';
    return {
      ...detail,
      // An update that rolled back, for the admins' banner (US-STORE-17).
      rolledBack: admin ? ctx.services.updates.rolledBack(input.appId) : null,
      // What a reinstall would do, for admins (US-APP-24).
      reinstall: admin ? await ctx.services.reinstalls.info(input.appId) : null,
    };
  },
  install: (input, ctx) =>
    ctx.services.installer.begin(installer(ctx), {
      ...input,
      // From the source it's listed in (a library app isn't in the built-in store, US-STORE-27).
      source: input.source ?? ctx.services.sources.sourceOf(input.appId) ?? undefined,
      env: input.env ?? {},
      mounts: (input.mounts ?? []).map((m) => ({ ...m, subpath: m.subpath ?? '', mode: m.mode ?? 'rw' })),
      acceptRisks: input.acceptRisks ?? false,
    }),
  // Admins only (the router's access); the outcome arrives as app.stateChanged (US-APP-02…04).
  start: (input, ctx) => (ctx.services.apps.command(input.appId, 'start'), { ok: true as const }),
  stop: (input, ctx) => (ctx.services.apps.command(input.appId, 'stop'), { ok: true as const }),
  restart: (input, ctx) => (ctx.services.apps.command(input.appId, 'restart'), { ok: true as const }),
  // Admins only (the router's access), audited (US-APP-06).
  setAutostart: (input, ctx) => {
    ctx.services.apps.setBehaviour(input.appId, 'autostart', input.enabled, installer(ctx));
    return { ok: true as const };
  },
  setAutoUpdate: (input, ctx) => {
    ctx.services.apps.setBehaviour(input.appId, 'autoUpdate', input.enabled, installer(ctx));
    return { ok: true as const };
  },
  // Admins only: logs can hold secrets (07 §7.6).
  logs: async (input, ctx) => ({
    lines: await ctx.services.logs.recent(input.appId, {
      service: input.service,
      tail: input.tail ?? 500,
      since: input.since,
    }),
  }),
  watchLogs: (input, ctx, signal) =>
    ctx.services.logs.watch(input.appId, { service: input.service, since: input.since }, signal),
  update: (input, ctx) => ctx.services.updates.update(installer(ctx), input.appId),
  /** Every app in the Updates list, in its order (US-STORE-15). */
  updateAll: (_input, ctx) => {
    const order = appUpdatesOf(ctx.services).pending.map((p) => p.appId);
    return ctx.services.updates.updateAll(installer(ctx), order);
  },
  retryInstall: (input, ctx) => ctx.services.installer.retry(installer(ctx), input.appId, input.portOverrides?.web),
  uninstall: (input, ctx) => ctx.services.installer.uninstall(installer(ctx), input.appId, input.keepData),
  reinstall: (input, ctx) => ctx.services.reinstalls.reinstall(installer(ctx), input.appId),
  /** Whether this app's Home widgets need a key, and whether one is set (US-HOME-20, D-157). */
  widgetKey: async ({ appId }, ctx) => {
    const app = appWidgetsOf(ctx.services.db, appId);
    if (!app) throw hlabsError('NOT_FOUND');
    const keyed = app.widgets.find((w) => w.auth);
    return {
      needed: Boolean(keyed),
      set: keyed ? Boolean(await ctx.services.secrets.get(widgetKeyRef(appId))) : false,
      help: keyed?.auth?.help ?? null,
    };
  },
  /** The key in the keychain (never SQLite or logs), audited without it (07 §7.7). */
  setWidgetKey: async ({ appId, key }, ctx) => {
    const user = installer(ctx);
    const app = appWidgetsOf(ctx.services.db, appId);
    if (!app?.widgets.some((w) => w.auth)) throw hlabsError('NOT_FOUND');
    if (key === null) await ctx.services.secrets.delete(widgetKeyRef(appId));
    else await ctx.services.secrets.set(widgetKeyRef(appId), key);
    ctx.services.appWidgets.forget(appId);
    ctx.services.db
      .insert(auditLog)
      .values({
        id: ulid(),
        at: Date.now(),
        userId: user.userId,
        action: key === null ? 'app.widget_key.removed' : 'app.widget_key.set',
        target: appId,
        detailJson: null,
        ip: user.ip,
      })
      .run();
    return { ok: true as const };
  },
  /** Only the apps this person can open, enforced here, not in the UI (07 §7.4). */
  list: (_input, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
    return listApps(ctx.services.db, { id: id.userId, role: id.role }, (name) =>
      ctx.services.routing.isPublished(name),
    );
  },
};
