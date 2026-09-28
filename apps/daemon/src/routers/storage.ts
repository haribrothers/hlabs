import type { AppHandlers } from '@hlabs/api';
import { storageLocations } from '@hlabs/db';
import type { DaemonContext } from '../context';

export const storage: AppHandlers<DaemonContext>['storage'] = {
  /** The data dir's disk (US-HOME-02); apps (phase 2) and files (phase 5) are counted when they arrive. */
  summary: async (_input, ctx) => {
    const { totalBytes, freeBytes } = await ctx.services.system.diskSpace(ctx.services.config.paths.dataDir);
    const appsBytes = 0;
    const filesBytes = 0;
    return {
      totalBytes,
      freeBytes,
      appsBytes,
      filesBytes,
      systemBytes: Math.max(0, totalBytes - freeBytes - appsBytes - filesBytes),
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
