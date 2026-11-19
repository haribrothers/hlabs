// Backups (08-usage-backups). Thin: who's asking, then the backup services. Admins only (07 §7.4).
import { hlabsError, type AppHandlers } from '@hlabs/api';
import type { DaemonContext } from '../context';

const who = (ctx: DaemonContext) => ({
  userId: ctx.identity.kind === 'user' ? ctx.identity.userId : null,
  ip: ctx.request.ip,
});

function userId(ctx: DaemonContext): string {
  if (ctx.identity.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
  return ctx.identity.userId;
}

export const backups: Partial<AppHandlers<DaemonContext>['backups']> = {
  destinations: {
    list: (_input, ctx) => ({ destinations: ctx.services.destinations.list() }),
    test: (input, ctx) => ctx.services.destinations.test(input),
    add: (input, ctx) => ctx.services.destinations.add(input, who(ctx)),
    update: async ({ destinationId, ...input }, ctx) => {
      await ctx.services.destinations.update(destinationId, input, who(ctx));
      return { ok: true as const };
    },
    remove: async ({ destinationId }, ctx) => {
      await ctx.services.destinations.remove(destinationId, who(ctx));
      return { ok: true as const };
    },
  },
  exportRepoPassword: ({ destinationId, password }, ctx) =>
    ctx.services.destinations.exportPassword(destinationId, { userId: userId(ctx), password, ip: ctx.request.ip }),
};
