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

export const storage = {
  summary: io(empty, pending),
  listDrives: io(empty, pending),
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
