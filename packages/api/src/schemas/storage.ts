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
  summary: io(empty, pending),
  /** Connected, writable external drives. */
  listDrives: io(empty, z.object({ drives: z.array(driveSchema) })),
  locations: {
    list: io(empty, pending),
    discover: io(empty, pending),
    testNetwork: io(networkLocationSchema, ok),
    addNetwork: io(networkLocationSchema, z.object({ locationId: idSchema })),
    remove: io(z.object({ locationId: idSchema }), ok),
    eject: io(z.object({ locationId: idSchema }), ok),
  },
  moveAllPlan: io(z.object({ destinationPath: z.string() }), pending),
  moveAll: io(z.object({ destinationPath: z.string(), keepOldCopy: z.boolean().default(true) }), jobRefSchema),
  pruneImages: io(empty, jobRefSchema),
};
