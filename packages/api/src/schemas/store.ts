import { STORE_CATEGORY_GROUP_IDS } from '@hlabs/shared';
import { z } from 'zod';
import { io } from '../trpc';
import { homeAppSchema } from './apps';
import { appIdSchema, appRefSchema, appStateSchema, empty, idSchema, ok, pageInputSchema, pending } from './common';

/** App updates (US-SYS-25): installed apps with a newer store version, and updates that rolled back. */
export const storeUpdatesSchema = z.object({
  pending: z.array(
    z.object({
      appId: z.string(),
      name: z.string(),
      icon: homeAppSchema.shape.icon,
      state: appStateSchema,
      fromVersion: z.string(),
      toVersion: z.string(),
      /** The new version's "What's new" (Markdown, the manifest's `releaseNotes`); null without notes. */
      releaseNotes: z.string().nullable(),
    }),
  ),
  /** Updates that didn't start and were rolled back, until an admin dismisses them (US-STORE-17). */
  rolledBack: z.array(
    z.object({
      appId: z.string(),
      name: z.string(),
      fromVersion: z.string(),
      toVersion: z.string(),
      /** False: going back failed too. */
      restored: z.boolean(),
    }),
  ),
  /** The last check (the store index is refreshed with hlabs's update check). */
  lastCheckedAt: z.number().nullable(),
});
export type StoreUpdates = z.infer<typeof storeUpdatesSchema>;

export const storeCategoryGroupSchema = z.enum(STORE_CATEGORY_GROUP_IDS);

/** This computer, for platform tags (US-STORE-01): "Apple Silicon" on an arm64 Mac, "ARM64" on arm64 Linux. */
export const storeHostSchema = z.object({ os: z.enum(['macos', 'linux']), arm64: z.boolean() });

/** An app as the store lists it (cards and rows). */
export const storeAppSchema = z.object({
  id: appIdSchema,
  sourceId: idSchema,
  name: z.string(),
  tagline: z.string(),
  /** The manifest category, and the store group it belongs to (US-STORE-02). */
  category: z.string(),
  group: storeCategoryGroupSchema,
  icon: z.object({
    logoUrl: z.string().nullable(),
    gradient: z.tuple([z.string(), z.string()]).nullable(),
    fallback: z.string().nullable(),
  }),
  /** Manifest tags (e.g. `local-ai`); the dashboard labels the ones it knows. */
  tags: z.array(z.string()),
  /** Has a linux/arm64 image. */
  arm64: z.boolean(),
  /** Installed on this hlabs (by anyone); install state comes from apps.list and events. */
  installed: z.boolean(),
});
export type StoreApp = z.infer<typeof storeAppSchema>;

/** A compose service as AppDetails' "Runs as" names it (US-STORE-06). */
export const storeServiceSchema = z.object({
  name: z.string(),
  /** A well-known image's product name ("PostgreSQL", "Redis"), for the install sheet's "Includes" (US-STORE-09). */
  product: z.string().nullable(),
  /** The web service is the server; postgres/mariadb/mysql/mongo images a database; redis/valkey/memcached a cache. */
  role: z.enum(['server', 'database', 'cache']).nullable(),
});

/** Everything AppDetails shows (US-STORE-06, US-STORE-07). */
export const storeAppDetailsSchema = z.object({
  host: storeHostSchema,
  app: storeAppSchema,
  source: z.object({ id: idSchema, name: z.string(), official: z.boolean() }),
  version: z.string(),
  description: z.string(),
  /** The app's README.md (markdown), shown instead of the description when present. */
  readme: z.string().nullable(),
  releaseNotes: z.string().nullable(),
  /** Up to 5 screenshot URLs. */
  screenshots: z.array(z.string()),
  services: z.array(storeServiceSchema),
  /** Where it will open, e.g. `immich.hlabs.local`. */
  address: z.string(),
  folders: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      description: z.string().nullable(),
      mode: z.enum(['ro', 'rw']),
      required: z.boolean(),
      /** Where it goes unless changed (US-STORE-08), for the person asking; null without a default. */
      default: z
        .object({
          /** Null for a folder in the app's own data. */
          storageLocationId: z.string().nullable(),
          subpath: z.string(),
          place: z.object({
            area: z.enum(['home', 'shared', 'appdata', 'location']),
            locationName: z.string().nullable(),
            path: z.string(),
          }),
          /** False when its location is offline. */
          available: z.boolean(),
        })
        .nullable(),
    }),
  ),
  /** What it needs from this computer (US-STORE-07). Null where the manifest doesn't say or it can't be measured. */
  requirements: z.object({
    memoryBytes: z.number().nullable(),
    diskBytes: z.number().nullable(),
    /** The engine's memory less what installed apps recommend (D-080). */
    memoryFreeBytes: z.number().nullable(),
    /** Free space where app data lives (D-011). */
    diskFreeBytes: z.number().nullable(),
  }),
  /** What it can reach (US-STORE-07). */
  access: z.object({
    network: z.enum(['none', 'lan', 'internet']),
    ports: z.array(z.object({ label: z.string(), host: z.number(), protocol: z.enum(['tcp', 'udp']) })),
    gpu: z.boolean(),
    dockerSocket: z.boolean(),
  }),
  /** Other apps it needs installed first. */
  dependsOn: z.array(z.object({ appId: z.string(), name: z.string(), installed: z.boolean() })),
  /** What the install sheet needs (US-STORE-09, US-STORE-10). */
  install: z.object({
    /** `hlabs`: the hlabs login protects it; `none`: it opens without one. */
    webAuth: z.enum(['hlabs', 'none']),
    ownLogin: z.boolean(),
    /** Addresses it can't take: reserved ones, the dashboard's name and other apps'. */
    takenHostnames: z.array(z.string()),
    /** The settings prompts people see (hidden and generated ones are left out). */
    env: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        description: z.string().nullable(),
        type: z.enum(['string', 'secret', 'number', 'boolean', 'select']),
        options: z.array(z.string()).nullable(),
        default: z.string().nullable(),
        required: z.boolean(),
      }),
    ),
    /** Docker access, raw ports or the GPU: needs "I understand" (US-STORE-10). */
    risky: z.boolean(),
    /** This person may install it (admins; members only with the rules in 07 §7.4). */
    allowed: z.boolean(),
  }),
});
export type StoreAppDetails = z.infer<typeof storeAppDetailsSchema>;

export const store = {
  getHome: io(
    empty,
    z.object({
      host: storeHostSchema,
      featured: z.array(storeAppSchema),
      collections: z.array(z.object({ id: z.string(), title: z.string(), apps: z.array(storeAppSchema) })),
      totalApps: z.number().int().nonnegative(),
    }),
  ),
  listApps: io(
    pageInputSchema.extend({
      category: storeCategoryGroupSchema.optional(),
      /** A store home row's apps ("See all", US-STORE-01). */
      collection: z.string().max(40).optional(),
      query: z.string().max(200).optional(),
      source: idSchema.optional(),
      sort: z.enum(['popular', 'new', 'name']).optional(),
      installedOnly: z.boolean().optional(),
      arm64Only: z.boolean().optional(),
    }),
    z.object({
      host: storeHostSchema,
      /** A collection's title when `collection` was asked for. */
      title: z.string().nullable(),
      items: z.array(storeAppSchema),
      nextCursor: z.string().nullable(),
    }),
  ),
  getApp: io(appRefSchema.extend({ source: idSchema.optional() }), storeAppDetailsSchema),
  listCategories: io(
    empty,
    z.object({ categories: z.array(z.object({ id: storeCategoryGroupSchema, count: z.number().int().positive() })) }),
  ),
  listUpdates: io(empty, storeUpdatesSchema),
  sources: {
    list: io(empty, pending),
    inspect: io(z.object({ url: z.string().url() }), pending),
    add: io(z.object({ url: z.string().url(), publicKey: z.string().optional() }), z.object({ sourceId: idSchema })),
    remove: io(z.object({ sourceId: idSchema }), ok),
    sync: io(z.object({ sourceId: idSchema.optional() }), ok),
  },
};
