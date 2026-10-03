import { z } from 'zod';
import { io } from '../trpc';
import { empty, engineKindSchema, jobRefSchema, ok, pending } from './common';

export const accentSchema = z.enum(['violet', 'mint', 'amber', 'rose']);

export const startupSchema = z.object({
  /** Start hlabs when the person logs in; the tray applies it (D-042). */
  startAtLogin: z.boolean(),
  /** Apps set to start automatically come back after a restart. */
  autostartApps: z.boolean(),
  /** Hold off sleep while an app runs. */
  keepAwake: z.boolean(),
});

/** hlabs's version and its updates (US-SYS-23, US-SYS-24, US-SYS-26). */
export const updateStatusSchema = z.object({
  /** The version running now. */
  version: z.string(),
  channel: z.enum(['stable', 'beta']),
  autoHlabs: z.boolean(),
  autoApps: z.boolean(),
  backupBeforeUpdate: z.boolean(),
  /** The last check that reached the update manifest; null before the first. */
  lastCheckedAt: z.number().nullable(),
  /** A newer version, or null when up to date. */
  available: z.object({ version: z.string(), notes: z.array(z.string()), url: z.string() }).nullable(),
});
export type UpdateStatus = z.infer<typeof updateStatusSchema>;

export const settings = {
  /** Global settings shown in Settings; more keys join with their sections. */
  get: io(empty, z.object({ startup: startupSchema })),
  appearance: {
    update: io(
      z.object({
        wallpaper: z.string().optional(),
        accent: accentSchema.optional(),
        reduceTransparency: z.boolean().optional(),
        reduceMotion: z.boolean().optional(),
        showWidgets: z.boolean().optional(),
        showGreeting: z.boolean().optional(),
      }),
      ok,
    ),
  },
  notifications: {
    update: io(z.record(z.string(), z.unknown()), ok),
    test: io(empty, ok),
  },
  engine: {
    /** Engine & startup (US-SYS-17): which engine runs apps, its state, and the others on this computer. */
    get: io(
      empty,
      z.object({
        platform: z.enum(['darwin', 'linux']),
        /** `starting` while an engine install or restart job runs. */
        status: z.enum(['running', 'stopped', 'starting', 'missing']),
        active: z
          .object({ kind: engineKindSchema, managedByHlabs: z.boolean(), version: z.string().nullable() })
          .nullable(),
        /** macOS: OrbStack, Docker Desktop, Colima; Linux: Docker Engine (and any other engine found). */
        engines: z.array(
          z.object({ kind: engineKindSchema, availability: z.enum(['active', 'found', 'notInstalled']) }),
        ),
        /**
         * Resources for apps (US-SYS-19); null on Linux or with no engine. Editable only for hlabs's own Colima;
         * other engines show what they report (disk unknown).
         */
        resources: z
          .object({
            editable: z.boolean(),
            cpus: z.number().int().nullable(),
            memoryBytes: z.number().nullable(),
            diskBytes: z.number().nullable(),
            limits: z.object({
              maxCpus: z.number().int(),
              minMemoryBytes: z.number(),
              maxMemoryBytes: z.number(),
              minDiskBytes: z.number(),
              maxDiskBytes: z.number(),
            }),
          })
          .nullable(),
      }),
    ),
    /** hlabs's Colima only: apply by restarting the engine (US-SYS-19); disk can only grow. */
    setResources: io(
      z.object({
        cpus: z.number().int().positive(),
        memoryBytes: z.number().int().positive(),
        diskBytes: z.number().int().positive(),
      }),
      jobRefSchema,
    ),
    planSwitch: io(z.object({ target: engineKindSchema }), pending),
    switch: io(z.object({ target: engineKindSchema, removeColima: z.boolean().default(false) }), jobRefSchema),
    restart: io(empty, jobRefSchema),
    start: io(empty, jobRefSchema),
  },
  startup: {
    update: io(
      z.object({
        startAtLogin: z.boolean().optional(),
        autostartApps: z.boolean().optional(),
        keepAwake: z.boolean().optional(),
      }),
      ok,
    ),
  },
  updates: {
    get: io(empty, updateStatusSchema),
    check: io(empty, updateStatusSchema),
    setChannel: io(z.object({ channel: z.enum(['stable', 'beta']) }), ok),
    setAuto: io(z.object({ hlabs: z.boolean(), apps: z.boolean(), backupBeforeUpdate: z.boolean() }), ok),
    install: io(empty, jobRefSchema),
  },
};
