// Typed keys of the `settings` table (docs/prd/04-data-model.md §System). Every read is validated
// and falls back to the default, so a missing or older row never breaks the daemon.
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { HlabsDb } from './db';
import { settings } from './schema/system';

export const ACCENTS = ['violet', 'mint', 'amber', 'rose'] as const;
export const ENGINE_KINDS = ['orbstack', 'docker-desktop', 'colima', 'docker-engine'] as const;

const portSchema = z.number().int().min(1).max(65535);

/** Settings with one global value. */
export const settingsSchemas = {
  hostname: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .default('hlabs'),
  people: z
    .object({
      showUserList: z.boolean().default(true),
      requireTotp: z.boolean().default(false),
      membersCanInstall: z.boolean().default(false),
      membersCanSeeUsage: z.boolean().default(false),
    })
    .default({ showUserList: true, requireTotp: false, membersCanInstall: false, membersCanSeeUsage: false }),
  engine: z
    .object({
      preferred: z.enum(['auto', ...ENGINE_KINDS]).default('auto'),
      /** hlabs's Colima as last applied (US-SYS-19); null: the install defaults. */
      resources: z
        .object({
          cpus: z.number().int().positive(),
          memoryBytes: z.number().int().positive(),
          diskBytes: z.number().int().positive().optional(),
        })
        .nullable()
        .default(null),
    })
    .default({ preferred: 'auto', resources: null }),
  updates: z
    .object({
      channel: z.enum(['stable', 'beta']).default('stable'),
      autoHlabs: z.boolean().default(true),
      autoApps: z.boolean().default(false),
      backupBeforeUpdate: z.boolean().default(true),
    })
    .default({ channel: 'stable', autoHlabs: true, autoApps: false, backupBeforeUpdate: true }),
  remote: z
    .object({
      state: z.enum(['off', 'connecting', 'connected', 'error']).default('off'),
      tailnetName: z.string().nullable().default(null),
    })
    .default({ state: 'off', tailnetName: null }),
  paused: z
    .object({ at: z.number().int(), appIds: z.array(z.string()) })
    .nullable()
    .default(null),
  notifications: z
    .object({
      tray: z.boolean().default(true),
      ntfy: z
        .object({ server: z.url(), topic: z.string().min(1) })
        .nullable()
        .default(null),
    })
    .default({ tray: true, ntfy: null }),
  ai: z
    .object({
      enabled: z.boolean().default(false),
      permissions: z
        .object({ read: z.boolean().default(true), control: z.boolean().default(false) })
        .default({ read: true, control: false }),
    })
    .default({ enabled: false, permissions: { read: true, control: false } }),
  onboarding: z
    .object({
      completedAt: z.number().int().nullable().default(null),
      step: z.string().default('welcome'),
      /** Secret-store ref of the one-time setup token (D-013). */
      setupTokenRef: z.string().nullable().default(null),
    })
    .default({ completedAt: null, step: 'welcome', setupTokenRef: null }),
  network: z
    .object({
      ports: z.object({ https: portSchema, http: portSchema }).default({ https: 443, http: 80 }),
      piholeDns: z.boolean().default(false),
    })
    .default({ ports: { https: 443, http: 80 }, piholeDns: false }),
  startup: z
    .object({
      startAtLogin: z.boolean().default(true),
      autostartApps: z.boolean().default(true),
      keepAwake: z.boolean().default(false),
    })
    .default({ startAtLogin: true, autostartApps: true, keepAwake: false }),
  /** Last-contacted time per outbound service (Advanced › What hlabs connects to). */
  connections: z.record(z.string(), z.object({ lastContactAt: z.number().int() })).default({}),
} as const;

/** Settings stored once per user under `<key>:<userId>`. */
export const userSettingsSchemas = {
  appearance: z
    .object({
      wallpaper: z.string().default('dusk'),
      accent: z.enum(ACCENTS).default('violet'),
      reduceTransparency: z.boolean().default(false),
      reduceMotion: z.boolean().default(false),
      showWidgets: z.boolean().default(true),
      showGreeting: z.boolean().default(true),
    })
    .default({
      wallpaper: 'dusk',
      accent: 'violet',
      reduceTransparency: false,
      reduceMotion: false,
      showWidgets: true,
      showGreeting: true,
    }),
  /** Per-user in-app notification switches (D-043); missing keys mean "on". */
  notifications: z.record(z.string(), z.boolean()).default({}),
} as const;

export type SettingKey = keyof typeof settingsSchemas;
export type SettingValue<K extends SettingKey> = z.output<(typeof settingsSchemas)[K]>;
export type UserSettingKey = keyof typeof userSettingsSchemas;
export type UserSettingValue<K extends UserSettingKey> = z.output<(typeof userSettingsSchemas)[K]>;

function readRaw(db: HlabsDb, key: string): unknown {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.valueJson;
}

function writeRaw(db: HlabsDb, key: string, value: unknown): void {
  db.insert(settings)
    .values({ key, valueJson: value })
    .onConflictDoUpdate({ target: settings.key, set: { valueJson: value } })
    .run();
}

function parseOrDefault<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : schema.parse(undefined);
}

export function getSetting<K extends SettingKey>(db: HlabsDb, key: K): SettingValue<K> {
  return parseOrDefault(settingsSchemas[key], readRaw(db, key)) as SettingValue<K>;
}

export function setSetting<K extends SettingKey>(db: HlabsDb, key: K, value: z.input<(typeof settingsSchemas)[K]>) {
  const parsed = settingsSchemas[key].parse(value) as SettingValue<K>;
  writeRaw(db, key, parsed);
  return parsed;
}

export function getUserSetting<K extends UserSettingKey>(db: HlabsDb, key: K, userId: string): UserSettingValue<K> {
  return parseOrDefault(userSettingsSchemas[key], readRaw(db, `${key}:${userId}`)) as UserSettingValue<K>;
}

export function setUserSetting<K extends UserSettingKey>(
  db: HlabsDb,
  key: K,
  userId: string,
  value: z.input<(typeof userSettingsSchemas)[K]>,
) {
  const parsed = userSettingsSchemas[key].parse(value) as UserSettingValue<K>;
  writeRaw(db, `${key}:${userId}`, parsed);
  return parsed;
}
