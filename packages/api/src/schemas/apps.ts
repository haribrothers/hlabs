import { z } from 'zod';
import { io } from '../trpc';
import { appRefSchema, empty, hostnameSchema, idSchema, jobIdsSchema, jobRefSchema, ok, pending } from './common';

const envSchema = z.record(z.string(), z.string());
const mountSchema = z.object({
  target: z.string(),
  storageLocationId: idSchema,
  subpath: z.string().default(''),
  mode: z.enum(['ro', 'rw']).default('rw'),
});
const portSchema = z.number().int().min(1).max(65535);

export const logLineSchema = z.object({
  service: z.string(),
  stream: z.enum(['stdout', 'stderr']),
  ts: z.number(),
  line: z.string(),
});
export type LogLine = z.infer<typeof logLineSchema>;

export const apps = {
  list: io(empty, pending),
  get: io(appRefSchema, pending),
  install: io(
    appRefSchema.extend({
      source: idSchema.optional(),
      env: envSchema.default({}),
      mounts: z.array(mountSchema).default([]),
      hostname: hostnameSchema.optional(),
      acceptRisks: z.boolean().default(false),
    }),
    jobRefSchema,
  ),
  retryInstall: io(appRefSchema.extend({ portOverrides: z.record(z.string(), portSchema).optional() }), jobRefSchema),
  start: io(appRefSchema, ok),
  stop: io(appRefSchema, ok),
  restart: io(appRefSchema, ok),
  update: io(appRefSchema, jobRefSchema),
  updateAll: io(empty, jobIdsSchema),
  uninstall: io(appRefSchema.extend({ keepData: z.boolean() }), jobRefSchema),
  getConfig: io(appRefSchema, pending),
  setConfig: io(
    appRefSchema.extend({
      env: envSchema.optional(),
      hostname: hostnameSchema.optional(),
      hostPort: portSchema.optional(),
    }),
    ok,
  ),
  revealSecret: io(appRefSchema.extend({ key: z.string() }), z.object({ value: z.string() })),
  setMounts: io(appRefSchema.extend({ mounts: z.array(mountSchema) }), ok),
  setPermissions: io(
    appRefSchema.extend({
      mounts: z.array(mountSchema),
      network: z.object({ internet: z.boolean(), apps: z.boolean() }),
    }),
    ok,
  ),
  setAutostart: io(appRefSchema.extend({ enabled: z.boolean() }), ok),
  setAutoUpdate: io(appRefSchema.extend({ enabled: z.boolean() }), ok),
  setAuthMode: io(appRefSchema.extend({ mode: z.enum(['hlabs', 'none']) }), ok),
  logs: io(
    appRefSchema.extend({
      service: z.string().optional(),
      tail: z.number().int().min(1).max(10_000).default(500),
      since: z.number().int().optional(),
    }),
    z.object({ lines: z.array(logLineSchema) }),
  ),
  watchLogsInput: appRefSchema.extend({ service: z.string().optional() }),
  moveData: io(appRefSchema.extend({ storageLocationId: idSchema }), jobRefSchema),
  deployCustom: io(
    z.object({
      compose: z.string().min(1),
      name: z.string().min(1).max(40),
      webService: z.string(),
      webPort: portSchema,
    }),
    jobRefSchema,
  ),
};
