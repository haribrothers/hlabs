import { z } from 'zod';
import { healthOkSchema } from '../health';
import { io } from '../trpc';
import { empty, engineKindSchema, hostnameSchema, jobRefSchema, ok, passwordSchema } from './common';

export const systemInfoSchema = z.object({
  version: z.string(),
  hostname: hostnameSchema,
  /** `headless`: a Linux server without a desktop session (no menu bar). */
  os: z.object({ platform: z.enum(['darwin', 'linux']), release: z.string(), arch: z.string(), headless: z.boolean() }),
  cpu: z.object({ model: z.string(), cores: z.number().int() }),
  memoryBytes: z.number(),
  uptimeSeconds: z.number(),
  engine: z.object({ kind: engineKindSchema.nullable(), running: z.boolean(), version: z.string().nullable() }),
});

/** hlabs's own logs (US-SYS-27): the background service, the proxy (Caddy) and app installs. */
export const SYSTEM_LOG_SOURCES = ['daemon', 'proxy', 'installs'] as const;
export type SystemLogSource = (typeof SYSTEM_LOG_SOURCES)[number];

/** One line of hlabs's own logs, with anything secret already masked as `••••` by the daemon. */
export const systemLogLineSchema = z.object({
  /** When it was written (ms). */
  at: z.number(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  text: z.string(),
});
export type SystemLogLine = z.infer<typeof systemLogLineSchema>;

/** Each outside service hlabs talks to (US-SYS-29, 07 §7.1). */
export const CONNECTION_KINDS = [
  'store',
  'registry',
  'updates',
  'tailscale',
  'backup',
  'ntfy',
  'pihole',
  'engineDownload',
  /** Cloudflare Tunnel, while it's set up for public apps (US-SYS-43, D-171). */
  'cloudflare',
] as const;
export const connectionSchema = z.object({
  /** Stable for the list (`store:<sourceId>`, `registry:docker.io`, `backup:<destinationId>`…). */
  id: z.string(),
  kind: z.enum(CONNECTION_KINDS),
  /** A store source's or backup destination's name; null for the others. */
  name: z.string().nullable(),
  /** The host (or address) contacted. */
  host: z.string(),
  /** `off`: set up but not in use now (Tailscale disconnected, a source turned off). */
  state: z.enum(['on', 'off']),
  /** The last time hlabs contacted it (ms), or null when it hasn't yet. */
  lastContactAt: z.number().nullable(),
});
export type Connection = z.infer<typeof connectionSchema>;

export const system = {
  health: io(empty, healthOkSchema),
  info: io(empty, systemInfoSchema),
  /** Stops every app and starts hlabs again (US-SYS-31); `JOB_EXCLUSIVE_RUNNING` while an exclusive job runs. */
  restartDaemon: io(empty, ok),
  /**
   * Deletes everything and returns to onboarding (US-SYS-37, US-SYS-38). `setupToken` is the setup token of the
   * onboarding that follows (D-013), for the browser that asked: it opens `/setup?token=…` once hlabs is back.
   */
  factoryReset: io(
    z.object({ password: passwordSchema, confirmHostname: z.string(), keepHomeFolders: z.boolean().default(false) }),
    jobRefSchema.extend({ setupToken: z.string() }),
  ),
  /** The last `limit` lines of a source, or those written after `since` (ms), oldest first (US-SYS-27). */
  logs: io(
    z.object({
      source: z.enum(SYSTEM_LOG_SOURCES),
      since: z.number().int().optional(),
      limit: z.number().int().min(1).max(5000).default(500),
    }),
    z.object({ lines: z.array(systemLogLineSchema) }),
  ),
  /** Builds the bundle as a job; `GET /api/diagnostics/:jobId` downloads it (US-SYS-28). */
  diagnostics: io(empty, jobRefSchema),
  connections: io(empty, z.object({ connections: z.array(connectionSchema) })),
};
