import { z } from 'zod';
import { io } from '../trpc';
import { empty, idSchema, jobRefSchema, ok, pending } from './common';

const networkLocationSchema = z.object({
  protocol: z.enum(['smb', 'nfs']),
  host: z.string().min(1),
  share: z.string().min(1),
  name: z.string().min(1).max(60).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  appsAllowed: z.boolean().default(true),
  autoMount: z.boolean().default(true),
});

/** A connected external drive (US-ONB-15). */
export const driveSchema = z.object({
  path: z.string(),
  name: z.string(),
  freeBytes: z.number().nonnegative(),
  fsType: z.enum(['apfs', 'hfs', 'exfat', 'fat32', 'ntfs', 'ext4', 'btrfs', 'xfs', 'other']),
  writable: z.boolean(),
});

export const storage = {
  /**
   * This computer's disk, where hlabs and its apps keep their data (US-HOME-02). Apps, files and the backup cache
   * are counted as their phases ship; until then they are 0 and "system" is everything else in use.
   */
  summary: io(
    empty,
    z.object({
      totalBytes: z.number().nonnegative(),
      freeBytes: z.number().nonnegative(),
      appsBytes: z.number().nonnegative(),
      filesBytes: z.number().nonnegative(),
      systemBytes: z.number().nonnegative(),
      hlabsBytes: z.number().nonnegative(),
      backupCacheBytes: z.number().nonnegative(),
      reclaimableImageBytes: z.number().nonnegative(),
    }),
  ),
  /** Connected, writable external drives. */
  listDrives: io(empty, z.object({ drives: z.array(driveSchema) })),
  locations: {
    /** Storage locations; exactly one is the root (04 invariant 4). */
    list: io(
      empty,
      z.object({
        locations: z.array(
          z.object({
            id: idSchema,
            kind: z.enum(['local', 'external', 'smb', 'nfs']),
            name: z.string(),
            path: z.string(),
            isRoot: z.boolean(),
            status: z.string(),
            /** Mounted again at start and every minute while unreachable (US-FILE-11). */
            autoMount: z.boolean(),
            /** Offered to apps' folders (US-FILE-11). */
            appsAllowed: z.boolean(),
            /** Names of the apps that keep folders on it: it can't be disconnected while there are any (US-FILE-12). */
            usedBy: z.array(z.string()),
          }),
        ),
      }),
    ),
    /** SMB and NFS servers that announced themselves within 5 s, with the shares a guest may list (US-FILE-11). */
    discover: io(
      empty,
      z.object({
        servers: z.array(
          z.object({
            name: z.string(),
            host: z.string(),
            protocol: z.enum(['smb', 'nfs']),
            shares: z.array(z.string()).nullable(),
          }),
        ),
      }),
    ),
    /**
     * With a share: mounts it somewhere temporary, checks hlabs can write there, and unmounts (10 s at most). Without
     * one: the shares the server lists for a guest (`null` when it won't say).
     */
    testNetwork: io(
      networkLocationSchema.extend({ share: z.string().optional() }),
      z.object({ ok: z.literal(true), shares: z.array(z.string()).nullable().optional() }),
    ),
    addNetwork: io(networkLocationSchema, z.object({ locationId: idSchema })),
    remove: io(z.object({ locationId: idSchema }), ok),
    /** "Try again" on a drive that can't be reached (US-FILE-12): mounts it now. */
    reconnect: io(z.object({ locationId: idSchema }), z.object({ status: z.enum(['ok', 'unreachable']) })),
    eject: io(z.object({ locationId: idSchema }), ok),
  },
  moveAllPlan: io(z.object({ destinationPath: z.string() }), pending),
  moveAll: io(z.object({ destinationPath: z.string(), keepOldCopy: z.boolean().default(true) }), jobRefSchema),
  pruneImages: io(empty, jobRefSchema),
};
