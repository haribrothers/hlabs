// GET /healthz bodies (docs/prd/05-api.md §From 11 · System states).
import { z } from 'zod';

export const HEALTH_REASONS = [
  'starting',
  'updating',
  'migration_failed',
  'storage_unavailable',
  /** "Restart hlabs" (US-SYS-31): the apps are stopping and the daemon starts again. */
  'restarting',
  /** A factory reset (US-SYS-38) is deleting everything; `step` of `steps` says how far it is. */
  'resetting',
  /** Produced by Caddy's error handler, never by the daemon. */
  'daemon_unreachable',
] as const;
export type HealthReason = (typeof HEALTH_REASONS)[number];

export const healthOkSchema = z.object({ status: z.literal('ok'), version: z.string() });
export type HealthOk = z.infer<typeof healthOkSchema>;

export const healthUnavailableSchema = z.object({
  reason: z.enum(HEALTH_REASONS),
  step: z.number().int().optional(),
  steps: z.number().int().optional(),
  stepLabel: z.string().optional(),
});
export type HealthUnavailable = z.infer<typeof healthUnavailableSchema>;
