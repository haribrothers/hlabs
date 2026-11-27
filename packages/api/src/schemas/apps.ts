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
} from './common';
import { ENV_NAME_PATTERN, isReservedEnvName } from '@hlabs/shared';
import { appPublicSchema, appsPublic } from './public';

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
  /** The manifest's `ownLogin`: people log in to the app itself too ("Uses its own login too", US-ACCT-24). */
  ownLogin: z.boolean(),
  urls: z.object({
    /** `https://<app>.<hostname>.local` */
    local: z.string(),
    /** `https://<hostname>.<tailnet>.ts.net:<port + 2000>` when remote access is on (D-012, D-110). */
    tailnet: z.string().nullable(),
    /**
     * Its own port (12000–12999), served under any name: the dashboard opened at an address like
     * `https://192.168.1.20` opens the app at `https://192.168.1.20:<port>` (US-SYS-41).
     */
    port: z.number().int().nullable(),
  }),
  /**
   * Its public address while it's public on the internet (the "Public" badge, US-APP-27); null while private. Always
   * sent by the daemon (optional only for older test fixtures).
   */
  public: appPublicSchema.nullable().optional(),
});

/** One installed app (US-STORE-12…14, AppWindow US-APP-01…03): its tile, state, why, where it opens, its install job. */
export const appDetailSchema = homeAppSchema.extend({
  /** `apps.state_detail`: the hlabsCode and its values, e.g. `{ code: "APP_PORT_IN_USE", port: 12003, step: "start" }`. */
  stateDetail: z.record(z.string(), z.unknown()).nullable(),
  /** e.g. `immich.hlabs.local` */
  address: z.string(),
  /**
   * The app's port (12000–12999): its LAN fallback port; its tailnet port is this + 2000 (D-110). Its web service
   * listens on 127.0.0.1 at this + 1000 (D-086).
   */
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
  /** The source it came from was removed: it keeps working but gets no updates (US-STORE-18). */
  sourceRemoved: z.boolean(),
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
  /** "Require hlabs login" (US-APP-19): `hlabs` puts the hlabs sign-in in front of it, `none` leaves it to the app. */
  authMode: z.enum(['hlabs', 'none']),
  /**
   * What a reinstall would do (US-APP-24): the version it installs again (the installed one), about how much it
   * downloads (null while counted) and why it can't run (its settings or manifest are gone, or apps are paused from
   * the menu bar). Null for members.
   */
  reinstall: z
    .object({
      version: z.string(),
      downloadBytes: z.number().int().nullable(),
      blocked: z.enum(['settings_missing', 'manifest_missing', 'paused']).nullable(),
    })
    .nullable(),
});
export type AppDetail = z.infer<typeof appDetailSchema>;

/** Variable names people may use (US-APP-13), in @hlabs/shared so App settings' form can check them too. */
export { ENV_NAME_PATTERN, isReservedEnvName };

/** Where a folder is, for people (US-APP-17): "Home › Documents", "Shared › Media", "NAS › Backups". */
export const folderPlaceSchema = z.object({
  area: z.enum(['home', 'shared', 'appdata', 'location']),
  /** The storage location's name for `location`; for another person's Home, their username. */
  locationName: z.string().nullable(),
  /** The folder inside the area, e.g. "Documents" (empty for the area itself). */
  path: z.string(),
});

/** An app's settings for App settings › Configuration and Permissions (US-APP-13…19). Admins only. */
export const appConfigSchema = z.object({
  env: z.array(
    z.object({
      key: z.string(),
      /** Null for a secret: its value reaches the browser only through `apps.revealSecret` (US-APP-14). */
      value: z.string().nullable(),
      secret: z.boolean(),
      /** Generated by hlabs (`generate: true`): revealed and copied, never edited. */
      generated: z.boolean(),
      /** The manifest prompt it comes from; null for a variable someone added. */
      prompt: z
        .object({
          label: z.string().nullable(),
          description: z.string().nullable(),
          type: z.enum(['string', 'secret', 'number', 'boolean', 'select']),
          options: z.array(z.string()).nullable(),
          /** Shown only after "Show advanced". */
          hidden: z.boolean(),
          required: z.boolean(),
        })
        .nullable(),
    }),
  ),
  address: z.object({
    /** The label before `.<domain>` (`vaultwarden`). */
    hostname: z.string(),
    /** `hlabs.local` */
    domain: z.string(),
    /** Names another app has or hlabs keeps (`hlabs`, the dashboard's own). */
    taken: z.array(z.string()),
  }),
  port: z.object({
    /** The app's port on this computer (12000–12999); its tailnet port is this + 2000 (D-110). */
    hostPort: z.number().int().nullable(),
    /** Manifest `web.port`: where it listens inside its container. */
    containerPort: z.number().int(),
    /** Ports other apps hold. */
    taken: z.array(z.number().int()),
    /** `hlabs.<tailnet>.ts.net` while remote access is on, for "On your tailnet at …". */
    tailnetHost: z.string().nullable(),
  }),
  folders: z.array(
    z.object({
      /** The manifest folder's key, or `/mnt/hlabs/<name>` for one given in App settings. */
      target: z.string(),
      storageLocationId: z.string(),
      subpath: z.string(),
      mode: z.enum(['ro', 'rw']),
      place: folderPlaceSchema,
      /** Its path in Files, where the folder picker opens. */
      filesPath: z.string(),
      /** False while its drive isn't connected ("Not connected"). */
      available: z.boolean(),
      /** The manifest folder it is; null for one given in App settings. */
      folder: z
        .object({
          key: z.string(),
          label: z.string(),
          description: z.string().nullable(),
          required: z.boolean(),
          /** The most it may have: `ro` can't be made writable. */
          mode: z.enum(['ro', 'rw']),
        })
        .nullable(),
    }),
  ),
  /** Manifest folders it hasn't been given (optional ones), to give it again. */
  folderRequests: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      description: z.string().nullable(),
      mode: z.enum(['ro', 'rw']),
    }),
  ),
  /** What it asked for from this computer (D-163), read only. */
  devices: z.object({
    gpu: z.boolean(),
    list: z.array(z.object({ path: z.string(), label: z.string() })),
    capabilities: z.array(z.string()),
  }),
  network: z.object({
    internet: z.boolean(),
    apps: z.boolean(),
    /** Manifest `permissions.internetReason`. */
    internetReason: z.string().nullable(),
  }),
  auth: z.object({
    mode: z.enum(['hlabs', 'none']),
    /** Manifest `ownLogin`: "Uses its own login too". */
    ownLogin: z.boolean(),
  }),
});
export type AppConfig = z.infer<typeof appConfigSchema>;

/** One variable as App settings saves it: a secret left as it was has no value (it stays in the .env). */
export const envEntrySchema = z.object({
  key: z.string().regex(ENV_NAME_PATTERN).max(100),
  value: z.string().max(10_000).optional(),
  secret: z.boolean().default(false),
});

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
  /** Rebuilds the app, keeping its data and settings (US-APP-25): the job already going when there is one. */
  reinstall: io(appRefSchema, jobRefSchema),
  /** An app's Home widgets that need an API key (US-HOME-20, D-157): whether one is needed and set, and where to make it. */
  widgetKey: io(appRefSchema, z.object({ needed: z.boolean(), set: z.boolean(), help: z.string().nullable() })),
  /** Adds (or with null removes) that key; kept in the keychain, never in SQLite. */
  setWidgetKey: io(
    appRefSchema.extend({ key: z.string().trim().min(1).max(500).nullable() }),
    z.object({ ok: z.literal(true) }),
  ),
  getConfig: io(appRefSchema, appConfigSchema),
  /**
   * Saves the variables (the whole list, in order), address and port, then restarts the app as an `app_config` job;
   * if it isn't healthy in time, the previous settings come back (US-APP-13…16).
   */
  setConfig: io(
    appRefSchema.extend({
      env: z.array(envEntrySchema).max(200).optional(),
      hostname: hostnameSchema.optional(),
      hostPort: portSchema.optional(),
    }),
    jobRefSchema,
  ),
  revealSecret: io(appRefSchema.extend({ key: z.string() }), z.object({ value: z.string() })),
  setMounts: io(appRefSchema.extend({ mounts: z.array(mountSchema) }), ok),
  /** Folders and network access together, one restart as an `app_config` job, undone when unhealthy (US-APP-17, 18). */
  setPermissions: io(
    appRefSchema.extend({
      mounts: z.array(mountSchema).max(50),
      network: z.object({ internet: z.boolean(), apps: z.boolean() }),
    }),
    jobRefSchema,
  ),
  setAutostart: io(appRefSchema.extend({ enabled: z.boolean() }), ok),
  /** `APP_IS_PUBLIC` when turning it off while the app is public (07 §7.10). */
  setAutoUpdate: io(appRefSchema.extend({ enabled: z.boolean() }), ok),
  /** `APP_IS_PUBLIC` when turning it off while the app is public with the hlabs login (AppSettingsPublic). */
  setAuthMode: io(appRefSchema.extend({ mode: z.enum(['hlabs', 'none']) }), ok),
  ...appsPublic,
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
