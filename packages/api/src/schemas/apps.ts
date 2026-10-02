import { z } from 'zod';
import { io } from '../trpc';
import {
  appRefSchema,
  appStateSchema,
  empty,
  hostnameSchema,
  idSchema,
  jobIdsSchema,
  jobRefSchema,
  ok,
  pending,
} from './common';

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
  /** Not a line: the service's container restarted while followed, so the view shows a divider (US-APP-08). */
  restarted: z.boolean().optional(),
});
export type LogLine = z.infer<typeof logLineSchema>;

/** An app on Home (US-HOME-03): what its tile needs and where it opens. */
export const homeAppSchema = z.object({
  id: z.string(),
  /** The manifest's name, e.g. "Jellyfin". */
  name: z.string(),
  state: appStateSchema,
  icon: z.object({
    /** The manifest logo, as a URL the dashboard can load; null without one. */
    logoUrl: z.string().nullable(),
    gradient: z.tuple([z.string(), z.string()]).nullable(),
    /** A Lucide icon name (kebab-case). */
    fallback: z.string().nullable(),
  }),
  /** D-038: opens in AppWindow (phase 2) instead of a new tab. */
  embed: z.boolean(),
  urls: z.object({
    /** `https://<app>.<hostname>.local` */
    local: z.string(),
    /** `https://<hostname>.<tailnet>.ts.net:<port>` when remote access is on (D-012). */
    tailnet: z.string().nullable(),
  }),
});

/** One installed app (US-STORE-12…14, AppWindow US-APP-01…03): its tile, state, why, where it opens, its install job. */
export const appDetailSchema = homeAppSchema.extend({
  /** `apps.state_detail`: the hlabsCode and its values, e.g. `{ code: "APP_PORT_IN_USE", port: 12003, step: "start" }`. */
  stateDetail: z.record(z.string(), z.unknown()).nullable(),
  /** e.g. `immich.hlabs.local` */
  address: z.string(),
  /** The app's port (12000–12999): its LAN fallback and tailnet port. Its web service listens on 127.0.0.1 at this + 1000
   * (D-086). */
  webPort: z.number().int().nullable(),
  /** Its latest install job, for the progress page. */
  installJobId: z.string().nullable(),
  /** After a failed install: the next free port in 12000–12999, for "Use a different port" (US-STORE-14). */
  nextFreePort: z.number().int().nullable(),
  /** Manifest `web.path`: where the app window's frame opens (US-APP-01). */
  webPath: z.string(),
  /** False while the container engine is stopped: the window says so instead of loading (US-APP-03). */
  engineRunning: z.boolean(),
  /** When its web container started (ms since the epoch) while it runs, for "up 6 days" (US-APP-04); null otherwise. */
  startedAt: z.number().int().nullable(),
  /** Where its data lives, as people know it (`~/hlabs/app-data/vaultwarden`, US-APP-07). */
  dataFolder: z.string(),
  /** Its data folder and images on disk (counted every 10 minutes); null while the first count is still going. */
  disk: z.object({ dataBytes: z.number().int(), imageBytes: z.number().int() }).nullable(),
  /** The installed version, and the store's when it's a different one (null when up to date, US-APP-07). */
  version: z.string(),
  latestVersion: z.string().nullable(),
  /** The names of installed apps that need this one (`dependsOn`): it can't be uninstalled first (US-APP-11). */
  dependents: z.array(z.string()),
  /** Its compose services, for the Logs view's Container choice (US-APP-09). */
  services: z.array(z.string()),
  /**
   * An update that didn't start and that an admin hasn't dismissed (US-STORE-17): `restored` when the previous version
   * runs again. Null for members and when there's none.
   */
  rolledBack: z
    .object({
      notificationId: z.string(),
      restored: z.boolean(),
      fromVersion: z.string(),
      toVersion: z.string(),
      jobId: z.string().nullable(),
      at: z.number(),
    })
    .nullable(),
  /** The behaviour switches (US-APP-06): starts with hlabs, updates itself; custom apps never update themselves. */
  autostart: z.boolean(),
  autoUpdate: z.boolean(),
  custom: z.boolean(),
});
export type AppDetail = z.infer<typeof appDetailSchema>;

export const apps = {
  /** The apps this person can open, admins all, members those shared with them. */
  list: io(empty, z.object({ apps: z.array(homeAppSchema) })),
  get: io(appRefSchema, appDetailSchema),
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
  /** `since` (ms): carry on after the last line of the initial `apps.logs` load. */
  watchLogsInput: appRefSchema.extend({ service: z.string().optional(), since: z.number().optional() }),
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
