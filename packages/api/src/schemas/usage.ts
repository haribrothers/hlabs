import { z } from 'zod';
import { io } from '../trpc';
import { appRefSchema, empty, engineKindSchema, pending } from './common';

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

export const usageMetricSchema = z.enum(['cpu', 'memBytes', 'netRx', 'netTx', 'diskRead', 'diskWrite']);

/** A point in a scope's history (US-USE-09): a 5 s sample, or a 1m or 1h average. */
export const usagePointSchema = z.object({
  ts: z.number(),
  cpu: reading,
  memBytes: reading,
  netRx: reading,
  netTx: reading,
  diskRead: reading,
  diskWrite: reading,
});
export type UsagePoint = z.infer<typeof usagePointSchema>;

export const usageHistorySchema = z.object({
  scope: z.string(),
  range: usageRangeSchema,
  /** 1 hour: 5 s samples (1m points before the daemon started); 24 hours: 1m; 7 and 30 days: 1h. */
  resolution: z.enum(['5s', '1m', '1h']),
  points: z.array(usagePointSchema),
  /** The highest value of the metric asked for in the range (US-USE-04); null without data. */
  peak: z.object({ ts: z.number(), value: z.number() }).nullable(),
});
export type UsageHistory = z.infer<typeof usageHistorySchema>;

/** What the Usage page says about this computer (US-USE-01): the tiles' context and the subtitle. */
export const usageOverviewSchema = z.object({
  cpuModel: z.string(),
  cores: z.number().int().nonnegative(),
  memTotalBytes: z.number().nonnegative(),
  /** The disk the storage root is on (an external drive when it's there); null when it can't be read. */
  storage: z
    .object({
      usedBytes: z.number().nonnegative(),
      totalBytes: z.number().nonnegative(),
      /** "Storage by use" (US-USE-04): apps and files are counted from their phases (until then 0); system is the rest. */
      appsBytes: z.number().nonnegative(),
      filesBytes: z.number().nonnegative(),
      systemBytes: z.number().nonnegative(),
    })
    .nullable(),
  engine: z.object({
    kind: engineKindSchema.nullable(),
    running: z.boolean(),
    /** What the engine may use (a VM's allocation; the whole computer for Docker Engine on Linux). */
    cpus: z.number().int().nonnegative().nullable(),
    memoryBytes: z.number().nonnegative().nullable(),
  }),
});
export type UsageOverview = z.infer<typeof usageOverviewSchema>;

/** Memory by app over a range (US-USE-04): the top five apps and "Other", on the host's timestamps. */
export const memoryByAppSchema = z.object({
  range: usageRangeSchema,
  resolution: z.enum(['5s', '1m', '1h']),
  ts: z.array(z.number()),
  series: z.array(z.object({ appId: z.string(), name: z.string(), values: z.array(z.number()) })).max(5),
  /** The rest of the host's memory: other apps, hlabs and the system. */
  other: z.array(z.number()),
  /** The host's memory peak in the range. */
  peak: z.object({ ts: z.number(), value: z.number() }).nullable(),
});
export type MemoryByApp = z.infer<typeof memoryByAppSchema>;

export const usage = {
  overview: io(empty, usageOverviewSchema),
  /** The latest sample; null before the first one. */
  current: io(empty, usageSampleSchema.nullable()),
  history: io(
    z.object({
      /** `host` or an appId. */
      scope: z.string().min(1),
      range: usageRangeSchema,
      /** Which metric `peak` is for; CPU when left out. */
      metric: usageMetricSchema.optional(),
    }),
    usageHistorySchema,
  ),
  memoryByApp: io(z.object({ range: usageRangeSchema }), memoryByAppSchema),
  topApps: io(z.object({ limit: z.number().int().min(1).max(50).default(5) }).optional(), pending),
  appDetail: io(appRefSchema, pending),
};
