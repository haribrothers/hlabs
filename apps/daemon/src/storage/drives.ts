// Network drives once connected (US-FILE-11, US-FILE-12): at start and every 60 s each SMB/NFS location is checked;
// one that isn't mounted or doesn't answer is `unreachable` (an offline dot in Files) and, when "Reconnect
// automatically" is on, mounted again. "Try again" mounts it now. Disconnect unmounts it, deletes its password from
// the secret store and forgets it, unless an app keeps folders on it. Status changes go out as
// `storage.locationChanged`.
import { hlabsError } from '@hlabs/api';
import { appMounts, apps, auditLog, storageLocations, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq, inArray } from 'drizzle-orm';
import { readdir, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { catalogManifest } from '../apps/list';
import type { EventBus } from '../events/bus';
import type { Logger } from '../logger';
import type { NetworkMounter } from '../platform/network-mount';
import type { SecretStore } from '../platform/secrets';

export const DRIVE_CHECK_MS = 60_000;
/** A drive that takes longer than this to list its top folder isn't answering. */
export const ANSWER_MS = 5_000;

type Location = typeof storageLocations.$inferSelect;
type MountOptions = { host: string; share: string; username: string | null };

export interface NetworkDrivesDeps {
  db: HlabsDb;
  secrets: SecretStore;
  mounter: NetworkMounter;
  mountsDir: string;
  bus: EventBus;
  logger: Logger;
}

export class NetworkDrives {
  private timer: NodeJS.Timeout | null = null;
  private checking: Promise<void> | null = null;

  constructor(private readonly deps: NetworkDrivesDeps) {}

  private networkLocations(): Location[] {
    return this.deps.db
      .select()
      .from(storageLocations)
      .where(inArray(storageLocations.kind, ['smb', 'nfs']))
      .all();
  }

  /** Mounted, and its top folder lists within 5 s. */
  private async answers(loc: Location): Promise<boolean> {
    if (!(await this.deps.mounter.isMounted(loc.path))) return false;
    return Promise.race([
      readdir(loc.path).then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((r) => setTimeout(() => r(false), ANSWER_MS).unref()),
    ]);
  }

  private setStatus(loc: Location, status: 'ok' | 'unreachable', now: number) {
    if (loc.status === status && status !== 'ok') return;
    this.deps.db
      .update(storageLocations)
      .set({ status, ...(status === 'ok' ? { lastSeenAt: now } : {}) })
      .where(eq(storageLocations.id, loc.id))
      .run();
    if (loc.status !== status) {
      this.deps.bus.emit('storage.locationChanged', {
        locationId: loc.id,
        change: status === 'ok' ? 'mounted' : 'offline',
      });
    }
  }

  /** Mounts the location again with its saved address and password; its mount point may move (macOS SMB). */
  private async mount(loc: Location): Promise<void> {
    const opts = JSON.parse(loc.mountOptions ?? '{}') as MountOptions;
    const password = loc.secretRef ? await this.deps.secrets.get(loc.secretRef) : null;
    const path = await this.deps.mounter.mount(
      {
        protocol: loc.kind as 'smb' | 'nfs',
        host: opts.host,
        share: opts.share,
        username: opts.username ?? undefined,
        password: password ?? undefined,
      },
      join(this.deps.mountsDir, loc.id),
    );
    if (path !== loc.path) {
      this.deps.db.update(storageLocations).set({ path }).where(eq(storageLocations.id, loc.id)).run();
      loc.path = path;
    }
  }

  /** One location: answering → ok; else offline, and mounted again when `remount`. */
  private async checkOne(loc: Location, remount: boolean, now: number): Promise<'ok' | 'unreachable'> {
    if (await this.answers(loc)) {
      this.setStatus(loc, 'ok', now);
      return 'ok';
    }
    if (remount) {
      try {
        await this.mount(loc);
        if (await this.answers(loc)) {
          this.setStatus(loc, 'ok', now);
          return 'ok';
        }
      } catch (err) {
        this.deps.logger.info(
          { location: loc.id, code: (err as { cause?: { hlabsCode?: string } }).cause?.hlabsCode },
          'network drive still unreachable',
        );
      }
    }
    this.setStatus(loc, 'unreachable', now);
    return 'unreachable';
  }

  /** Every network location, mounting those set to reconnect automatically. */
  check(now = Date.now()): Promise<void> {
    this.checking ??= (async () => {
      for (const loc of this.networkLocations()) await this.checkOne(loc, loc.autoMount, now);
    })().finally(() => {
      this.checking = null;
    });
    return this.checking;
  }

  /** "Try again" (US-FILE-12): mount it now, whatever the automatic setting. */
  async reconnect(locationId: string, now = Date.now()) {
    const loc = this.networkLocations().find((l) => l.id === locationId);
    if (!loc) throw hlabsError('NOT_FOUND', 'No such drive');
    return { status: await this.checkOne(loc, true, now) };
  }

  /** The apps that keep folders on a location, by name. */
  appsUsing(locationId: string): string[] {
    const rows = this.deps.db
      .select({ app: apps })
      .from(appMounts)
      .innerJoin(apps, eq(apps.id, appMounts.appId))
      .where(eq(appMounts.storageLocationId, locationId))
      .all();
    const names = new Map(rows.map(({ app }) => [app.id, catalogManifest(this.deps.db, app).name ?? app.id]));
    return [...names.values()];
  }

  /**
   * Disconnect (US-FILE-12): not the storage root, not while an app keeps folders there (STORAGE_LOCATION_IN_USE with
   * the apps). Unmounts, deletes the password and forgets the drive; files on it are untouched.
   */
  async remove(locationId: string, opts: { userId: string | null; ip: string | null; now?: number }) {
    const loc = this.networkLocations().find((l) => l.id === locationId);
    if (!loc || loc.isRoot) throw hlabsError('NOT_FOUND', 'No such drive');
    const using = this.appsUsing(locationId);
    if (using.length) throw hlabsError('STORAGE_LOCATION_IN_USE', 'Apps use this drive', { apps: using });
    await this.deps.mounter.unmount(loc.path).catch(() => {});
    await rmdir(join(this.deps.mountsDir, loc.id)).catch(() => {});
    if (loc.secretRef) await this.deps.secrets.delete(loc.secretRef).catch(() => {});
    const now = opts.now ?? Date.now();
    this.deps.db.transaction((tx) => {
      tx.delete(storageLocations).where(eq(storageLocations.id, loc.id)).run();
      tx.insert(auditLog)
        .values({
          id: ulid(),
          at: now,
          userId: opts.userId,
          action: 'storage.removeNetwork',
          target: loc.id,
          detailJson: { name: loc.name, protocol: loc.kind },
          ip: opts.ip,
        })
        .run();
    });
    this.deps.bus.emit('storage.locationChanged', { locationId: loc.id, change: 'removed' });
  }

  /** Uninstalling hlabs (D-143): every network drive is unmounted and remembered; nothing on them changes. */
  async unmountAll(): Promise<void> {
    this.stop();
    for (const loc of this.networkLocations()) await this.deps.mounter.unmount(loc.path).catch(() => {});
  }

  start(intervalMs = DRIVE_CHECK_MS) {
    void this.check();
    this.timer = setInterval(() => void this.check(), intervalMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
