// Public apps and the public dashboard through Cloudflare Tunnel (US-SYS-43…48; D-171, D-182): thin handlers over
// PublicService, which checks the caller is an admin again (07 §7.10 control 2). What only works at home is refused
// before these run (DaemonContext, US-SYS-47).
import { hlabsError, type AppHandlers } from '@hlabs/api';
import type { DaemonContext } from '../context';
import type { Actor } from '../public/service';

/** The signed-in person making the change, with where from (audited). */
export function actor(ctx: DaemonContext): Actor {
  const id = ctx.identity;
  if (id.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
  return { userId: id.userId, role: id.role, ip: ctx.request.ip };
}

export const publicAccess: AppHandlers<DaemonContext>['public'] = {
  status: (_input, ctx) => {
    actor(ctx);
    return ctx.services.publicApps.status();
  },
  cloudflareSignIn: (_input, ctx) => ctx.services.publicApps.startSignIn(actor(ctx)),
  cancelSignIn: (_input, ctx) => {
    ctx.services.publicApps.cancelSignIn(actor(ctx));
    return { ok: true as const };
  },
  setupCloudflare: ({ domain, token }, ctx) => ctx.services.publicApps.setupWithToken(actor(ctx), domain, token),
  remove: (_input, ctx) => ctx.services.publicApps.remove(actor(ctx)),
  turnOffAll: (_input, ctx) => ctx.services.publicApps.turnOffAll(actor(ctx), 'dashboard'),
  setDashboard: (input, ctx) => ctx.services.publicApps.setDashboard(actor(ctx), input),
  setDashboardAccess: (input, ctx) => ctx.services.publicApps.setDashboardAccess(actor(ctx), input),
};
