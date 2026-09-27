import { z } from 'zod';
import { io } from '../trpc';
import { empty, idSchema, jobRefSchema, ok, pageInputSchema, passwordSchema, pending } from './common';

const retentionSchema = z.object({
  daily: z.number().int().min(0),
  weekly: z.number().int().min(0),
  monthly: z.number().int().min(0),
});
const destinationRef = z.object({ destinationId: idSchema });
const destinationInput = z.object({
  kind: z.enum(['local', 'smb', 'nfs', 's3', 'sftp', 'hlabs']),
  name: z.string().min(1).max(60),
  config: z.record(z.string(), z.unknown()),
});

export const backups = {
  overview: io(empty, pending),
  destinations: {
    list: io(empty, pending),
    test: io(destinationInput, ok),
    add: io(destinationInput, z.object({ destinationId: idSchema, repoPassword: z.string() })),
    update: io(
      destinationRef.extend({ name: z.string().optional(), config: z.record(z.string(), z.unknown()).optional() }),
      ok,
    ),
    remove: io(destinationRef.extend({ deleteSnapshots: z.boolean().default(false) }), ok),
  },
  plan: {
    get: io(empty, pending),
    update: io(
      z.object({
        scheduleCron: z.string().optional(),
        retention: retentionSchema.optional(),
        include: z.unknown().optional(),
        enabled: z.boolean().optional(),
        pauseApps: z.boolean().optional(),
      }),
      ok,
    ),
    estimate: io(z.object({ retention: retentionSchema }), pending),
  },
  runNow: io(z.object({ destinationId: idSchema.optional() }).optional(), jobRefSchema),
  listRuns: io(pageInputSchema, pending),
  getRun: io(z.object({ runId: idSchema }), pending),
  listSnapshots: io(destinationRef, pending),
  getSnapshot: io(destinationRef.extend({ snapshotId: z.string() }), pending),
  restore: io(
    destinationRef.extend({ snapshotId: z.string(), scope: z.unknown(), password: passwordSchema }),
    jobRefSchema,
  ),
  exportRepoPassword: io(destinationRef.extend({ password: passwordSchema }), z.object({ repoPassword: z.string() })),
};
