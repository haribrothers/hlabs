// Network storage (US-ONB-16, US-FILE-11): test a share, then add it as a location. The password goes to the secret
// store (`nas:<id>`), never SQLite; the mount point is `<dataDir>/mounts/<id>` (macOS SMB: /Volumes, D-060).
import { hlabsError } from '@hlabs/api';
import { auditLog, storageLocations, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { rm, rmdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NetworkMounter, NetworkShare } from '../platform/network-mount';
import type { SecretStore } from '../platform/secrets';

export interface NetworkLocationInput extends NetworkShare {
  name?: string;
  appsAllowed?: boolean;
  autoMount?: boolean;
}

const PROBE = '.hlabs-write-test';

export class NetworkStorage {
  constructor(
    private readonly deps: { db: HlabsDb; secrets: SecretStore; mounter: NetworkMounter; mountsDir: string },
  ) {}

  /** Mounts in a temporary folder, checks hlabs can write there, and unmounts. */
  async test(share: NetworkShare): Promise<void> {
    const target = join(this.deps.mountsDir, `test-${ulid()}`);
    const mountPoint = await this.deps.mounter.mount(share, target);
    try {
      await this.checkWritable(mountPoint);
    } finally {
      await this.deps.mounter.unmount(mountPoint).catch(() => {});
      await rmdir(target).catch(() => {});
    }
  }

  /** Mounts the share for good and saves it as a location (not the root: onboarding.setStorage does that). */
  async add(input: NetworkLocationInput, opts: { userId: string | null; ip: string | null; now?: number }) {
    const id = ulid();
    const mountPoint = await this.deps.mounter.mount(input, join(this.deps.mountsDir, id));
    try {
      await this.checkWritable(mountPoint);
    } catch (err) {
      await this.deps.mounter.unmount(mountPoint).catch(() => {});
      throw err;
    }
    const secretRef = input.password ? `nas:${id}` : null;
    if (secretRef) await this.deps.secrets.set(secretRef, input.password!);
    const now = opts.now ?? Date.now();
    const name = input.name ?? `${input.host}/${input.share.replace(/^\/+/, '')}`;
    this.deps.db.transaction((tx) => {
      tx.insert(storageLocations)
        .values({
          id,
          kind: input.protocol,
          name,
          path: mountPoint,
          mountOptions: JSON.stringify({ host: input.host, share: input.share, username: input.username ?? null }),
          secretRef,
          isRoot: false,
          status: 'ok',
          lastSeenAt: now,
          autoMount: input.autoMount ?? true,
          appsAllowed: input.appsAllowed ?? true,
        })
        .run();
      tx.insert(auditLog)
        .values({
          id: ulid(),
          at: now,
          userId: opts.userId,
          action: 'storage.addNetwork',
          target: id,
          detailJson: { protocol: input.protocol, host: input.host, share: input.share },
          ip: opts.ip,
        })
        .run();
    });
    return id;
  }

  private async checkWritable(mountPoint: string) {
    const probe = join(mountPoint, PROBE);
    try {
      await writeFile(probe, 'hlabs');
      await rm(probe, { force: true });
    } catch {
      throw hlabsError('NAS_READ_ONLY');
    }
  }
}
