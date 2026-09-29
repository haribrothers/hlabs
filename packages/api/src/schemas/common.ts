// Shared building blocks for every router's schemas.
import { appIdSchema, displayNameSchema, EXCLUSIVE_JOB_KINDS, hostnameSchema, usernameSchema } from '@hlabs/shared';
import { z } from 'zod';
import { HLABS_CODES, type HlabsCode } from '../errors';

export { appIdSchema, displayNameSchema, hostnameSchema, usernameSchema };

export const idSchema = z.string().min(1).max(64);
export const timestampSchema = z.number().int().nonnegative();
export const passwordSchema = z.string().min(1).max(1024);
export const totpCodeSchema = z.string().regex(/^\d{6}$/);
export const hlabsCodeSchema = z.enum(HLABS_CODES as [HlabsCode, ...HlabsCode[]]);

/**
 * Placeholder for a shape that the story implementing the procedure will define.
 * Replace with a real schema (and update 05-api.md if it adds fields) when the procedure is built.
 */
export const pending = z.unknown();

export const empty = z.void();
export const ok = z.object({ ok: z.literal(true) });

export const roleSchema = z.enum(['admin', 'member']);
export type Role = z.infer<typeof roleSchema>;

export const appStateSchema = z.enum([
  'installing',
  'install_failed',
  'starting',
  'running',
  'stopping',
  'stopped',
  'restarting',
  'updating',
  'rolling_back',
  'error',
  'uninstalling',
]);

export const engineKindSchema = z.enum(['orbstack', 'docker-desktop', 'colima', 'docker-engine']);
export type EngineKind = z.infer<typeof engineKindSchema>;

export const severitySchema = z.enum(['info', 'success', 'warning', 'critical']);
export type Severity = z.infer<typeof severitySchema>;

/** Exclusive job kinds (D-020): one at a time, and never alongside app jobs. */
export { EXCLUSIVE_JOB_KINDS };

export const jobKindSchema = z.enum([
  ...EXCLUSIVE_JOB_KINDS,
  'app_install',
  'app_update',
  'app_uninstall',
  'app_move_data',
  'app_deploy_custom',
  'starter_apps',
  'backup',
  'engine_install',
  'engine_start',
  'engine_restart',
  'prune_images',
  'files_move',
  'diagnostics',
  'hlabs_uninstall',
  /** Dev and test only. */
  'noop',
]);
export type JobKind = z.infer<typeof jobKindSchema>;

export const jobStateSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export type JobState = z.infer<typeof jobStateSchema>;

export const jobRefSchema = z.object({ jobId: idSchema });
export const jobIdsSchema = z.object({ jobIds: z.array(idSchema) });

export const jobSchema = z.object({
  id: idSchema,
  kind: jobKindSchema,
  target: z.string().nullable(),
  state: jobStateSchema,
  progress: z.number().int().min(0).max(100),
  message: z.string().nullable(),
  hlabsCode: hlabsCodeSchema.nullable(),
  createdAt: timestampSchema,
  finishedAt: timestampSchema.nullable(),
});
export type Job = z.infer<typeof jobSchema>;

/** Cursor pagination (05 §Conventions). */
export const pageInputSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export const appRefSchema = z.object({ appId: appIdSchema });
