// A daemon ready for the backup stories (08-usage-backups): Files' fixture (a storage root, Hari the admin, Anu a
// member), the fake restic, a fake mounter for network drives and a fake external drive on "another disk".
import { storageLocations } from '@hlabs/db';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BootDeps } from '../src/boot';
import type { Drive } from '../src/platform/drives';
import { FakeMounter } from './fakes/mounter';
import { FakeRestic } from './fakes/restic';
import { filesDaemon } from './files-fixture';
import { tempDir } from './helpers';

export async function backupsDaemon(closers: Array<() => Promise<void>>, opts: { boot?: Partial<BootDeps> } = {}) {
  const restic = new FakeRestic();
  const mounter = new FakeMounter();
  const usb = tempDir('usb-');
  const drives: Drive[] = [{ path: usb, name: 'Backup disk', freeBytes: 1.4e12, fsType: 'exfat', writable: true }];
  const f = await filesDaemon(closers, {
    boot: { restic, mounter, drives: { externalDrives: async () => drives }, watchDrives: false, ...opts.boot },
  });
  // The USB drive is another disk; everything else is on this one.
  f.d.services!.destinations.deviceOf = async (p) => (p.startsWith(usb) ? 2 : 1);
  /** A network drive already connected in Files (US-FILE-11). */
  const nasDrive = (id = 'nas', name = 'NAS · Backups') => {
    const path = tempDir('nas-');
    mkdirSync(path, { recursive: true });
    f.db
      .insert(storageLocations)
      .values({
        id,
        kind: 'smb',
        name,
        path,
        mountOptions: JSON.stringify({ host: 'nas.local', share: 'Backups', username: 'hari' }),
        status: 'ok',
        appsAllowed: false,
      })
      .run();
    return { id, path, repo: join(path, 'hlabs-backups') };
  };
  return { ...f, restic, mounter, usb, drives, nasDrive, s: f.d.services! };
}

export const PASSWORD = 'maple-orbit-tundra-cobalt-ferry-quill';
