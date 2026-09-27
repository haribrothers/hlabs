import { z } from 'zod';
import { healthOkSchema } from '../health';
import { io } from '../trpc';
import { empty, engineKindSchema, hostnameSchema, jobRefSchema, ok, passwordSchema, pending } from './common';

export const systemInfoSchema = z.object({
  version: z.string(),
  hostname: hostnameSchema,
  os: z.object({ platform: z.enum(['darwin', 'linux']), release: z.string(), arch: z.string() }),
  cpu: z.object({ model: z.string(), cores: z.number().int() }),
  memoryBytes: z.number(),
  uptimeSeconds: z.number(),
  engine: z.object({ kind: engineKindSchema.nullable(), running: z.boolean(), version: z.string().nullable() }),
});

export const system = {
  health: io(empty, healthOkSchema),
  info: io(empty, systemInfoSchema),
  restartDaemon: io(empty, ok),
  factoryReset: io(
    z.object({ password: passwordSchema, confirmHostname: z.string(), keepHomeFolders: z.boolean().default(false) }),
    jobRefSchema,
  ),
  logs: io(
    z.object({
      source: z.enum(['daemon', 'proxy', 'installs']),
      since: z.number().int().optional(),
      limit: z.number().int().min(1).max(5000).default(500),
    }),
    pending,
  ),
  diagnostics: io(empty, jobRefSchema),
  connections: io(empty, pending),
};
