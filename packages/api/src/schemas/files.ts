import { z } from 'zod';
import { io } from '../trpc';
import { homeAppSchema } from './apps';
import { empty, jobRefSchema, ok, pageInputSchema, pending } from './common';

/**
 * Virtual paths (07-files, resolved and jailed server-side): `/home` (the caller's Home folder), `/shared`, and for
 * admins `/users` ("This computer": every Home folder and Shared), `/users/<folder>`, `/appdata` and `/appdata/<appId>`
 * (read only), `/drives/<locationId>`.
 */
export const virtualPathSchema = z.string().min(1).max(4096).startsWith('/');
const pathRef = z.object({ path: virtualPathSchema });
const pathsRef = z.object({ paths: z.array(virtualPathSchema).min(1) });

/** A file or folder in a listing (US-FILE-02). */
export const fileEntrySchema = z.object({
  name: z.string(),
  path: virtualPathSchema,
  kind: z.enum(['folder', 'file']),
  /** Files: bytes. Folders: null. */
  size: z.number().nonnegative().nullable(),
  /** Folders: entries inside (hidden ones left out). Files: null. */
  childCount: z.number().int().nonnegative().nullable(),
  modifiedAt: z.number(),
  /** From the name's extension; null when unknown and for folders. */
  mime: z.string().nullable(),
  /**
   * Images and videos a browser shows: a signed preview link for 5 minutes (US-FILE-06). Add `?w=256` for an image's
   * thumbnail (US-FILE-02); videos show their first frame. Null for everything else.
   */
  previewUrl: z.string().nullable(),
});
export type FileEntry = z.infer<typeof fileEntrySchema>;

/**
 * One step of the breadcrumb, top first. `name` is the folder's name, a person's display name (`/users/<folder>`),
 * an app's name (`/appdata/<id>`) or a drive's name (`/drives/<id>`); null for an area's top (`/home`, `/shared`,
 * `/users`, `/appdata`), which the dashboard names itself.
 */
export const fileCrumbSchema = z.object({ path: virtualPathSchema, name: z.string().nullable() });

/** What kind of place a path is in, for the footer and the toolbar (US-FILE-02, US-FILE-03). */
export const filePlaceSchema = z.object({
  area: z.enum(['home', 'shared', 'users', 'user', 'appdata', 'app', 'drive']),
  /** The owner's display name (home, user), the app's name (app) or the drive's name (drive). */
  name: z.string().nullable(),
  /** No New folder, Upload or other changes (app data, a read-only drive, the lists of places). */
  readOnly: z.boolean(),
});

export const fileSortSchema = z.enum(['name', 'modified', 'size', 'kind']);

export const files = {
  /** A folder's entries, folders first, paged at 200 (US-FILE-02); `count` and `filesBytes` cover the whole folder. */
  list: io(
    pathRef.extend({ sort: fileSortSchema.optional(), cursor: z.string().optional() }),
    z.object({
      path: virtualPathSchema,
      crumbs: z.array(fileCrumbSchema),
      place: filePlaceSchema,
      items: z.array(fileEntrySchema),
      nextCursor: z.string().nullable(),
      count: z.number().int().nonnegative(),
      filesBytes: z.number().nonnegative(),
    }),
  ),
  /** One file or folder; `dimensions` for images and videos when their header says (US-FILE-06). */
  stat: io(
    pathRef,
    fileEntrySchema.extend({
      dimensions: z.object({ width: z.number().int(), height: z.number().int() }).nullable(),
      /** The folder it is in, as a breadcrumb. */
      parent: z.array(fileCrumbSchema),
      readOnly: z.boolean(),
    }),
  ),
  /** The 50 most recently changed files in the caller's Home and, when allowed, Shared (US-FILE-01). */
  recent: io(empty, z.object({ items: z.array(fileEntrySchema) })),
  listTrash: io(pageInputSchema, pending),
  /** This person's unfinished uploads (US-FILE-09): picked again with the same name and size, they resume. */
  uploads: io(
    empty,
    z.object({
      uploads: z.array(
        z.object({
          id: z.string(),
          path: virtualPathSchema,
          name: z.string(),
          size: z.number().nonnegative(),
          received: z.number().nonnegative(),
          updatedAt: z.number(),
        }),
      ),
    }),
  ),
  /** Running apps the caller can open whose folders hold the path (US-FILE-07). */
  openWith: io(pathRef, z.object({ apps: z.array(homeAppSchema) })),
  /** A signed URL for 5 minutes, for this person only (US-FILE-06); `width` asks for a thumbnail. */
  preview: io(
    pathRef.extend({ width: z.number().int().min(16).max(2048).optional() }),
    z.object({ url: z.string(), expiresAt: z.number() }),
  ),
  /** Names containing the query, in the folder and below; at most `limit` (200), 5 s at most (US-FILE-04). */
  search: io(
    z.object({
      query: z.string().trim().min(2).max(200),
      path: virtualPathSchema,
      limit: z.number().int().min(1).max(200).optional(),
    }),
    z.object({
      items: z.array(fileEntrySchema),
      /** More matched than `limit`. */
      capped: z.boolean(),
      /** The 5 s ran out before every folder was searched. */
      truncated: z.boolean(),
    }),
  ),
  /** A new folder `name` in `path` (US-FILE-03). */
  mkdir: io(pathRef.extend({ name: z.string().max(1024) }), z.object({ path: virtualPathSchema })),
  rename: io(pathRef.extend({ name: z.string().min(1).max(255) }), ok),
  move: io(pathsRef.extend({ to: virtualPathSchema }), z.union([ok, jobRefSchema])),
  copy: io(pathsRef.extend({ to: virtualPathSchema }), z.union([ok, jobRefSchema])),
  trash: io(pathsRef, ok),
  restoreFromTrash: io(z.object({ ids: z.array(z.string()).min(1) }), ok),
  emptyTrash: io(z.object({ allUsers: z.boolean().optional() }).optional(), ok),
  shares: {
    get: io(pathRef, pending),
    set: io(pathRef.extend({ name: z.string(), readOnly: z.boolean(), users: z.array(z.string()) }), ok),
    remove: io(pathRef, ok),
  },
};
