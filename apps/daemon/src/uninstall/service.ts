// Uninstalling hlabs, the daemon's part (US-INST-21, US-INST-22, D-143, D-144): what the window says (tray.uninstallInfo)
// and the `hlabs_uninstall` job, which records it first, takes every app down (with its images and volumes when
// everything goes), unmounts network drives, removes the `hlabs` network, stops Caddy and the mDNS names, and can remove
// hlabs's own Colima. Deleting files is left to whoever stops the daemon afterwards (the tray, install.sh), so nothing
// has the database open while it goes.
import { hlabsError } from '@hlabs/api';
import { apps, auditLog, storageLocations, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { DownOptions } from '../apps/compose';
import type { JobRunner } from '../jobs/runner';
import type { Logger } from '../logger';

export const UNINSTALL_NETWORK = 'hlabs';
/** How long the window waits for the size of what "Delete everything" removes. */
export const SIZE_TIMEOUT_MS = 10_000;

export interface UninstallPayload {
  keepData: boolean;
  removeColima: boolean;
  via: 'tray' | 'cli';
}

export interface UninstallInfo {
  appCount: number;
  /** What "Delete everything" removes, or null when counting took too long. */
  dataBytes: number | null;
  storageRoot: string;
  colimaManaged: boolean;
}

export interface UninstallDeps {
  db: HlabsDb;
  jobs: JobRunner;
  logger: Logger;
  dataDir: string;
  storageRootDefault: string;
  apps: { composeDown(appId: string, options?: DownOptions): Promise<void> };
  /** The engine in use, when one answers. */
  engine: () => { removeNetwork(name: string): Promise<void> } | null;
  colimaManaged: () => boolean;
  networkDrives: { unmountAll(): Promise<void> };
  routing: { stop(): void };
  mdns: { unpublishAll(): Promise<void> };
  proxy: { stop(): Promise<void> };
  /** Stops and deletes the `hlabs` Colima profile and `<dataDir>/engine`. */
  removeColima: () => Promise<void>;
  sizeTimeoutMs?: number;
}

/**
 * Bytes under these folders, without following links or going onto another disk (a NAS mounted inside); null when it
 * takes longer than `timeoutMs`.
 */
export async function folderBytes(dirs: readonly string[], timeoutMs: number): Promise<number | null> {
  const deadline = Date.now() + timeoutMs;
  let total = 0;
  const walk = async (path: string, dev: number): Promise<boolean> => {
    if (Date.now() > deadline) return false;
    const st = await lstat(path).catch(() => null);
    if (!st || st.dev !== dev) return true;
    if (!st.isDirectory()) {
      total += st.size;
      return true;
    }
    for (const name of await readdir(path).catch(() => [] as string[])) {
      if (!(await walk(join(path, name), dev))) return false;
    }
    return true;
  };
  const seen = new Set<string>();
  for (const dir of dirs) {
    // The storage root is often inside the data dir, or the other way round: each file is counted once.
    if ([...seen].some((s) => dir === s || dir.startsWith(`${s}/`))) continue;
    for (const s of [...seen]) if (s.startsWith(`${dir}/`)) seen.delete(s);
    seen.add(dir);
  }
  for (const dir of seen) {
    const st = await lstat(dir).catch(() => null);
    if (st && !(await walk(dir, st.dev))) return null;
  }
  return total;
}

export class UninstallService {
  constructor(private readonly deps: UninstallDeps) {}

  storageRoot(): string {
    const root = this.deps.db
      .select({ path: storageLocations.path })
      .from(storageLocations)
      .where(eq(storageLocations.isRoot, true))
      .get();
    return root?.path ?? this.deps.storageRootDefault;
  }

  async info(): Promise<UninstallInfo> {
    const storageRoot = this.storageRoot();
    return {
      appCount: this.deps.db.select({ id: apps.id }).from(apps).all().length,
      dataBytes: await folderBytes([this.deps.dataDir, storageRoot], this.deps.sizeTimeoutMs ?? SIZE_TIMEOUT_MS),
      storageRoot,
      colimaManaged: this.deps.colimaManaged(),
    };
  }

  /** Starts the job; JOB_EXCLUSIVE_RUNNING while another job runs (D-020). */
  start(payload: UninstallPayload): string {
    return this.deps.jobs.start<UninstallPayload>('hlabs_uninstall', { payload });
  }

  register(): void {
    const { deps } = this;
    deps.jobs.register<UninstallPayload>('hlabs_uninstall', {
      run: async ({ payload, report }) => {
        const { keepData, removeColima, via } = payload;
        deps.db
          .insert(auditLog)
          .values({
            id: ulid(),
            at: Date.now(),
            userId: null,
            action: 'system.uninstall',
            target: null,
            detailJson: { keepData, removeColima, via },
            ip: null,
          })
          .run();

        report(5, 'stoppingApps');
        // Nothing may bring Caddy's config back while it goes.
        deps.routing.stop();
        const ids = deps.db
          .select({ id: apps.id })
          .from(apps)
          .all()
          .map((a) => a.id);
        const failed: string[] = [];
        for (const [i, appId] of ids.entries()) {
          await deps.apps
            .composeDown(appId, { removeImages: !keepData, removeVolumes: !keepData })
            .catch((err: unknown) => {
              deps.logger.warn({ err, appId }, 'uninstall: compose down failed');
              failed.push(appId);
            });
          report(5 + Math.round(((i + 1) / Math.max(ids.length, 1)) * 60), 'stoppingApps');
        }
        if (failed.length) throw hlabsError('INTERNAL', `Couldn't stop ${failed.join(', ')}`, { apps: failed });
        await deps.engine()?.removeNetwork(UNINSTALL_NETWORK);
        await deps.networkDrives.unmountAll();
        await deps.mdns.unpublishAll();
        await deps.proxy.stop();
        report(75, 'stoppingApps');

        if (removeColima && deps.colimaManaged()) {
          report(80, 'removingColima');
          await deps.removeColima();
        }
        report(100);
      },
    });
  }
}
