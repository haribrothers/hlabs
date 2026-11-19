// Backups (08-usage-backups). Thin: who's asking, then the backup services. Admins only (07 §7.4).
import { hlabsError, type AppHandlers } from '@hlabs/api';
import { auditLog, backupPlan } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { parseCron } from '../backups/cron';
import { includedItems, planRow, planView } from '../backups/plan';
import type { DaemonContext } from '../context';

const who = (ctx: DaemonContext) => ({
  userId: ctx.identity.kind === 'user' ? ctx.identity.userId : null,
  ip: ctx.request.ip,
});

function userId(ctx: DaemonContext): string {
  if (ctx.identity.kind !== 'user') throw hlabsError('AUTH_REQUIRED');
  return ctx.identity.userId;
}

const manifestOf = (ctx: DaemonContext) => (appId: string) => {
  try {
    return ctx.services.apps.manifest(appId);
  } catch {
    return null;
  }
};

export const backups: Partial<AppHandlers<DaemonContext>['backups']> = {
  overview: (_input, ctx) => ctx.services.backups.overview(),
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
  plan: {
    get: (_input, ctx) =>
      planView(ctx.services.db, ctx.services.config.paths.appDataDir, ctx.services.planSizes, manifestOf(ctx)),
    update: (input, ctx) => {
      const { db } = ctx.services;
      if (input.scheduleCron !== undefined) {
        try {
          parseCron(input.scheduleCron);
        } catch {
          throw hlabsError('VALIDATION_FAILED', 'Bad schedule', { scheduleCron: input.scheduleCron });
        }
      }
      planRow(db);
      db.transaction((tx) => {
        tx.update(backupPlan)
          .set({
            ...(input.scheduleCron !== undefined ? { scheduleCron: input.scheduleCron } : {}),
            ...(input.retention ? { retentionJson: input.retention } : {}),
            ...(input.include ? { includeJson: input.include } : {}),
            ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
            ...(input.pauseApps !== undefined ? { pauseApps: input.pauseApps } : {}),
          })
          .where(eq(backupPlan.id, 1))
          .run();
        tx.insert(auditLog)
          .values({
            id: ulid(),
            at: Date.now(),
            ...who(ctx),
            action: 'backup.plan.update',
            target: null,
            detailJson: {
              changed: Object.keys(input),
              ...(input.include ? { apps: input.include.apps.length, folders: input.include.folders.length } : {}),
            },
          })
          .run();
      });
      return { ok: true as const };
    },
    /** "About N GB per full copy" (US-BKP-23); per destination, its space with the retention asked for (US-BKP-13). */
    estimate: async (input, ctx) => {
      const { db, config, planSizes, destinations } = ctx.services;
      const items = includedItems(db, config.paths.appDataDir, input.include);
      const sizes = await Promise.all(items.map((i) => planSizes.bytes(i.path)));
      const retention = input.retention ?? planRow(db).retentionJson;
      const points = retention.daily + retention.weekly + retention.monthly;
      return {
        fullCopyBytes: sizes.reduce((a, b) => a + b, 0),
        items: destinations.list().map((d) => ({
          destinationId: d.id,
          name: d.name,
          estimatedBytes:
            d.usedBytes && d.restorePoints
              ? Math.round((d.usedBytes * (points / d.restorePoints)) / 5e9) * 5e9 || d.usedBytes
              : null,
        })),
      };
    },
  },
  runNow: (input, ctx) => ctx.services.backups.runNow(input?.destinationId),
  listRuns: (input, ctx) => ctx.services.backups.listRuns(input),
  getRun: ({ runId }, ctx) => ctx.services.backups.getRun(runId),
  exportRepoPassword: ({ destinationId, password }, ctx) =>
    ctx.services.destinations.exportPassword(destinationId, { userId: userId(ctx), password, ip: ctx.request.ip }),
};
