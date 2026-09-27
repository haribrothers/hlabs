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
    get: io(empty, pending),
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
