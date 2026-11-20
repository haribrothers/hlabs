import type { AppHandlers } from '@hlabs/api';
import { storageLocations } from '@hlabs/db';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
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
    list: async (_input, ctx) => ({
      locations: await Promise.all(
        ctx.services.db
          .select({
            id: storageLocations.id,
            kind: storageLocations.kind,
            name: storageLocations.name,
            path: storageLocations.path,
            isRoot: storageLocations.isRoot,
            status: storageLocations.status,
            autoMount: storageLocations.autoMount,
            appsAllowed: storageLocations.appsAllowed,
          })
          .from(storageLocations)
          .all()
          .map(async (l) => ({
            ...l,
            usedBy: ctx.services.networkDrives.appsUsing(l.id),
            // Only a mounted drive can say; one that's offline isn't read only, just away.
            readOnly:
              l.status === 'ok' &&
              (await access(l.path, constants.W_OK).then(
                () => false,
                () => true,
              )),
          })),
      ),
    }),
    discover: async (_input, ctx) => ({ servers: await ctx.services.discovery.browse(5_000) }),
    testNetwork: async ({ share, ...input }, ctx) => {
      // Without a share: what the server lists, as the user when one is given (US-FILE-11, "Show shares").
      if (!share) {
        const login = input.username ? { username: input.username, password: input.password ?? '' } : undefined;
        return { ok: true, shares: await ctx.services.discovery.shares(input.protocol, input.host, login) };
      }
      await ctx.services.network.test({ ...input, share });
      return { ok: true };
    },
    remove: async ({ locationId }, ctx) => {
      await ctx.services.networkDrives.remove(locationId, {
        userId: ctx.identity.kind === 'user' ? ctx.identity.userId : null,
        ip: ctx.request.ip,
      });
      return { ok: true };
    },
    reconnect: ({ locationId }, ctx) => ctx.services.networkDrives.reconnect(locationId),
    addNetwork: async (input, ctx) => {
      const locationId = await ctx.services.network.add(input, {
        userId: ctx.identity.kind === 'user' ? ctx.identity.userId : null,
        ip: ctx.request.ip,
      });
      ctx.services.bus.emit('storage.locationChanged', { locationId, change: 'added' });
      return { locationId };
    },
  },
};
