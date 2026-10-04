import type { AppHandlers } from '@hlabs/api';
import { storageLocations } from '@hlabs/db';
import type { DaemonContext } from '../context';
import { byUseDeps, storageByUse } from '../storage/by-use';

export const storage: AppHandlers<DaemonContext>['storage'] = {
  /** The data dir's disk by use (US-HOME-02): apps' data and images, files (from phase 5) and the rest. */
  summary: async (_input, ctx) => {
    const { totalBytes, freeBytes, appsBytes, filesBytes, systemBytes } = await storageByUse(
      byUseDeps(ctx.services),
      ctx.services.config.paths.dataDir,
    );
    return {
      totalBytes,
      freeBytes,
      appsBytes,
      filesBytes,
      systemBytes,
      hlabsBytes: 0,
      backupCacheBytes: 0,
      reclaimableImageBytes: 0,
    };
  },
  /** Only drives hlabs can write to are offered (US-ONB-15). */
  listDrives: async (_input, ctx) => ({
    drives: (await ctx.services.drives.externalDrives()).filter((d) => d.writable),
  }),
  locations: {
    list: (_input, ctx) => ({
      locations: ctx.services.db
        .select({
          id: storageLocations.id,
          kind: storageLocations.kind,
          name: storageLocations.name,
          path: storageLocations.path,
          isRoot: storageLocations.isRoot,
          status: storageLocations.status,
        })
        .from(storageLocations)
        .all(),
    }),
    testNetwork: async (input, ctx) => {
      await ctx.services.network.test(input);
      return { ok: true };
    },
    addNetwork: async (input, ctx) => ({
      locationId: await ctx.services.network.add(input, {
        userId: ctx.identity.kind === 'user' ? ctx.identity.userId : null,
        ip: ctx.request.ip,
      }),
    }),
  },
};
