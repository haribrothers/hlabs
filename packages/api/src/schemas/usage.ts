import { z } from 'zod';
import { io } from '../trpc';
import { appRefSchema, empty, pending } from './common';

export const usageRangeSchema = z.enum(['1h', '24h', '7d', '30d']);

/** A value not read in this sample (a slow or failed call, or the first sample after start for rates). */
const reading = z.number().nonnegative().nullable();

/** The host in one sample (US-USE-08); rates are bytes per second since the previous sample. */
export const hostSampleSchema = z.object({
  /** Host CPU in use, 0–100. */
  cpu: reading,
  memBytes: reading,
  memTotalBytes: z.number().nonnegative(),
  netRx: reading,
  netTx: reading,
  diskRead: reading,
  diskWrite: reading,
});

/** One app in one sample: all its containers summed; null values when its stats couldn't be read this time. */
export const appSampleSchema = z.object({
  appId: z.string(),
  /** Its share of the whole host's CPU, 0–100. */
  cpu: reading,
  memBytes: reading,
  netRx: reading,
  netTx: reading,
  diskRead: reading,
  diskWrite: reading,
});

/** Every 5 s (US-USE-08): the host, and each running app while the engine runs. */
export const usageSampleSchema = z.object({
  ts: z.number(),
  host: hostSampleSchema,
  apps: z.array(appSampleSchema),
});
export type UsageSample = z.infer<typeof usageSampleSchema>;
export type AppSample = z.infer<typeof appSampleSchema>;

export const usage = {
  /** The latest sample; null before the first one. */
  current: io(empty, usageSampleSchema.nullable()),
  history: io(
    z.object({
      scope: z.union([z.literal('host'), z.string()]),
      range: usageRangeSchema,
      metric: z.string().optional(),
    }),
    pending,
  ),
  topApps: io(z.object({ limit: z.number().int().min(1).max(50).default(5) }).optional(), pending),
  appDetail: io(appRefSchema, pending),
};
