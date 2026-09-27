// hlabs-app.yml, schema 1 (docs/prd/06-app-manifest.md). The single source of truth for validation
// in the daemon, the store CI and `pnpm store:lint`.
import { AppIconManifest } from '@hlabs/icons/manifest';
import { APP_ID_PATTERN } from '@hlabs/shared';
import { z } from 'zod';

export const APP_CATEGORIES = [
  'photos',
  'media',
  'files',
  'productivity',
  'home',
  'network',
  'security',
  'developer',
  'ai',
  'finance',
  'books',
  'monitoring',
  'other',
] as const;

export const PLATFORMS = ['linux/amd64', 'linux/arm64'] as const;

const serviceName = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, 'Use a compose service name');
const port = z.number().int().min(1).max(65535);
const envKey = z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'Use UPPER_SNAKE_CASE');
const folderKey = z.string().regex(/^[a-z][a-z0-9-]*$/, 'Use lowercase letters, numbers and dashes');

const envPrompt = z
  .object({
    key: envKey,
    label: z.string().min(1).optional(),
    description: z.string().optional(),
    type: z.enum(['string', 'secret', 'number', 'boolean', 'select']).default('string'),
    options: z.array(z.string()).min(1).optional(),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    /** Generated once at install (secrets). */
    generate: z.boolean().optional(),
    /** Not shown in InstallSheet; still editable in AppConfig by an admin. */
    hidden: z.boolean().optional(),
    required: z.boolean().optional(),
  })
  .strict()
  .refine((e) => e.type !== 'select' || (e.options?.length ?? 0) > 0, {
    message: 'A select needs options',
    path: ['options'],
  })
  .refine((e) => e.hidden || e.label, { message: 'Visible prompts need a label', path: ['label'] });

const folderRequest = z
  .object({
    key: folderKey,
    label: z.string().min(1),
    description: z.string().optional(),
    target: z.string().startsWith('/'),
    default: z
      .string()
      .regex(/^(home|shared|appdata):[^/].*$/, 'Use home:<dir>, shared:<dir> or appdata:<dir>')
      .optional(),
    mode: z.enum(['ro', 'rw']).default('rw'),
    required: z.boolean().default(false),
  })
  .strict();

const rawPort = z
  .object({
    service: serviceName,
    container: port,
    protocol: z.enum(['tcp', 'udp']).default('tcp'),
    host: port,
    label: z.string().min(1),
  })
  .strict();

const health = z
  .object({
    service: serviceName,
    http: z.string().startsWith('/').optional(),
    tcp: port.optional(),
    container: z.literal(true).optional(),
    timeout: z.number().int().min(10).max(1800).default(120),
  })
  .strict()
  .refine((h) => [h.http, h.tcp, h.container].filter((v) => v !== undefined).length === 1, {
    message: 'Pick one health check: http, tcp or container',
  });

const widget = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    name: z.string().min(1),
    template: z.enum(['stat', 'twoStat', 'list']),
    endpoint: z.object({ service: serviceName, path: z.string().startsWith('/') }).strict(),
    refresh: z.number().int().min(10).default(60),
  })
  .strict();

export const AppManifest = z
  .object({
    schema: z.literal(1),
    id: z.string().regex(APP_ID_PATTERN, 'App ids are 2–39 lowercase letters, numbers and dashes'),
    name: z.string().min(1).max(40),
    version: z.string().min(1),
    revision: z.number().int().min(0).default(0),
    tagline: z.string().min(1).max(80),
    description: z.string().min(1),
    category: z.enum(APP_CATEGORIES),
    developer: z.object({ name: z.string().min(1), url: z.url().optional() }).strict(),
    source: z.url().optional(),
    license: z.string().optional(),
    icon: AppIconManifest.optional(),
    platforms: z.array(z.enum(PLATFORMS)).min(1),
    tags: z.array(z.string()).default([]),
    requirements: z
      .object({ memory: z.number().int().positive().optional(), disk: z.number().int().positive().optional() })
      .strict()
      .default({}),
    web: z
      .object({
        service: serviceName,
        port,
        path: z.string().startsWith('/').default('/'),
        auth: z.enum(['hlabs', 'none']).default('hlabs'),
        /** D-038: default false, opens in a new tab. */
        embed: z.boolean().default(false),
      })
      .strict(),
    health: health.optional(),
    env: z.array(envPrompt).default([]),
    folders: z.array(folderRequest).default([]),
    ports: z.array(rawPort).default([]),
    backup: z
      .object({
        pause: z.array(serviceName).default([]),
        preHook: z
          .object({ service: serviceName, command: z.string().min(1) })
          .strict()
          .optional(),
        exclude: z.array(z.string()).default([]),
        beforeUpdate: z.boolean().default(false),
      })
      .strict()
      .default({ pause: [], exclude: [], beforeUpdate: false }),
    dependsOn: z.array(z.string().regex(APP_ID_PATTERN)).default([]),
    permissions: z
      .object({
        network: z.enum(['none', 'lan', 'internet']).default('internet'),
        gpu: z.boolean().default(false),
        dockerSocket: z.boolean().default(false),
      })
      .strict()
      .default({ network: 'internet', gpu: false, dockerSocket: false }),
    // Optional fields added in schema 1 (D-019).
    releaseNotes: z.string().optional(),
    ownLogin: z.boolean().default(false),
    widgets: z.array(widget).default([]),
  })
  .strict()
  .superRefine((m, ctx) => {
    const unique = (values: string[], path: string) => {
      const seen = new Set<string>();
      for (const v of values) {
        if (seen.has(v)) ctx.addIssue({ code: 'custom', path: [path], message: `Duplicate ${path} key "${v}"` });
        seen.add(v);
      }
    };
    unique(
      m.env.map((e) => e.key),
      'env',
    );
    unique(
      m.folders.map((f) => f.key),
      'folders',
    );
    if (m.dependsOn.includes(m.id))
      ctx.addIssue({ code: 'custom', path: ['dependsOn'], message: 'An app cannot depend on itself' });
  });

export type AppManifest = z.output<typeof AppManifest>;
export type AppManifestInput = z.input<typeof AppManifest>;

/** `library` → `HLABS_FOLDER_LIBRARY` (06 §Variables available to compose). */
export function folderVariable(key: string): string {
  return `HLABS_FOLDER_${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

/** True when installing needs the "risky permissions" acknowledgement (US-STORE-10). */
export function hasRiskyPermissions(m: AppManifest): boolean {
  return m.permissions.dockerSocket || m.permissions.gpu || m.ports.length > 0;
}
