import { z } from 'zod';
import { io } from '../trpc';
import { empty, engineKindSchema, jobRefSchema, ok, pending } from './common';

export const accentSchema = z.enum(['violet', 'mint', 'amber', 'rose']);

export const settings = {
  get: io(empty, pending),
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
      }),
    ),
    setResources: io(
      z.object({ cpus: z.number().int().positive(), memoryBytes: z.number().int().positive() }),
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
    get: io(empty, pending),
    check: io(empty, pending),
    setChannel: io(z.object({ channel: z.enum(['stable', 'beta']) }), ok),
    setAuto: io(z.object({ hlabs: z.boolean(), apps: z.boolean(), backupBeforeUpdate: z.boolean() }), ok),
    install: io(empty, jobRefSchema),
  },
};
