import type { AppHandlers } from '@hlabs/api';
import { storageLocations } from '@hlabs/db';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import type { DaemonContext } from '../context';
import { byUseDeps, storageByUse } from '../storage/by-use';

/** `/Users/hari/hlabs` → `~/hlabs` (US-SYS-12). */
export function homeShort(path: string, home = homedir()): string {
  if (path === home) return '~';
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

/** A network drive's address from its saved mount options: `smb://nas.local/Media`, `nfs://nas.local/volume1/media`. */
export function driveAddress(kind: string, mountOptions: string | null): string | null {
  if (kind !== 'smb' && kind !== 'nfs') return null;
  try {
    const { host, share } = JSON.parse(mountOptions ?? '{}') as { host?: string; share?: string };
    if (!host || !share) return null;
    return `${kind}://${host}/${share.replace(/^\/+/, '')}`;
  } catch {
    return null;
  }
}

/** How old the drives' status may be while Settings › Storage is open. */
const DRIVES_FRESH_MS = 10_000;

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

const who = (ctx: DaemonContext) => ({
  userId: ctx.identity.kind === 'user' ? ctx.identity.userId : null,
  ip: ctx.request.ip,
});

export const storage: AppHandlers<DaemonContext>['storage'] = {
  /**
   * The data dir's disk by use (US-HOME-02, US-SYS-11): apps' data and images, files, the backup cache, hlabs and
   * the rest; what freeing images would give back (US-SYS-13); everyone's Trash (US-SYS-14).
   */
  summary: async (_input, ctx) => {
    const s = ctx.services;
    const dataDir = s.config.paths.dataDir;
    const [byUse, media, reclaimableImageBytes] = await Promise.all([
      storageByUse(byUseDeps(s), dataDir),
      s.system.diskMedia(dataDir),
      s.imagePruner.reclaimableBytes(),
    ]);
    const trash = s.filesTrash.totals();
    return {
      totalBytes: byUse.totalBytes,
      freeBytes: byUse.freeBytes,
      appsBytes: byUse.appsBytes,
      filesBytes: byUse.filesBytes,
      systemBytes: byUse.systemBytes,
      hlabsBytes: byUse.hlabsBytes,
      backupCacheBytes: byUse.backupCacheBytes,
      reclaimableImageBytes,
      diskKind:
        media.internal === false
          ? ('external' as const)
          : media.internal === true
            ? media.solidState === true
              ? ('internalSsd' as const)
              : ('internalDisk' as const)
            : null,
      trashBytes: trash.bytes,
      trashCount: trash.count,
    };
  },
  pruneImages: (_input, ctx) => ctx.services.imagePruner.start(who(ctx).userId),
  /** Only drives hlabs can write to are offered (US-ONB-15). */
  listDrives: async (_input, ctx) => ({
    drives: (await ctx.services.drives.externalDrives()).filter((d) => d.writable),
  }),
  locations: {
    list: async (_input, ctx) => {
      // While Settings › Storage is open it asks every 10 s: drives are checked that often then (US-SYS-12).
      ctx.services.networkDrives.checkSoon(DRIVES_FRESH_MS);
      return {
        appDataPath: homeShort(ctx.services.config.paths.appDataDir),
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
              mountOptions: storageLocations.mountOptions,
            })
            .from(storageLocations)
            .all()
            .map(async ({ mountOptions, ...l }) => ({
              ...l,
              // An external drive that isn't the root is there or not (no minute's check for disks).
              status: l.kind === 'external' && !l.isRoot ? ((await exists(l.path)) ? 'ok' : 'unreachable') : l.status,
              displayPath: homeShort(l.path),
              address: driveAddress(l.kind, mountOptions),
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
      };
    },
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
    eject: ({ locationId }, ctx) => ctx.services.networkDrives.eject(locationId, who(ctx)),
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
