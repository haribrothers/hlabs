import type { AppHandlers } from '@hlabs/api';
import { hlabsError } from '@hlabs/api';
import { listApps } from '../apps/list';
import { visibleAppIds } from '../home/layout';
import type { DaemonContext } from '../context';

/** The signed-in person, as an installer. */
function installer(ctx: DaemonContext) {
  const id = ctx.identity;
  if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
  return { userId: id.userId, role: id.role, ip: ctx.request.ip };
}

export const apps: AppHandlers<DaemonContext>['apps'] = {
  /** Members get only the apps they can open (07 §7.4). */
  get: (input, ctx) => {
    const user = installer(ctx);
    if (
      user.role !== 'admin' &&
      !visibleAppIds(ctx.services.db, { id: user.userId, role: user.role }).includes(input.appId)
    ) {
      throw hlabsError('ACCESS_DENIED');
    }
    return ctx.services.installer.detail(input.appId);
  },
  install: (input, ctx) =>
    ctx.services.installer.begin(installer(ctx), {
      ...input,
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
  retryInstall: (input, ctx) => ctx.services.installer.retry(installer(ctx), input.appId, input.portOverrides?.web),
  uninstall: (input, ctx) => ctx.services.installer.uninstallFailed(installer(ctx), input.appId),
  /** Only the apps this person can open, enforced here, not in the UI (07 §7.4). */
  list: (_input, ctx) => {
    const id = ctx.identity;
    if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
    return listApps(ctx.services.db, { id: id.userId, role: id.role }, (name) =>
      ctx.services.routing.isPublished(name),
    );
  },
};
