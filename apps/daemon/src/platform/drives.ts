// Connected external drives (US-ONB-15). macOS: volumes in /Volumes that `diskutil` says aren't internal; Linux:
// removable-media mounts (/media, /run/media, /mnt) from /proc/mounts. Behind an interface so tests use a fake.
import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, readdir, readFile, statfs } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';

export type DriveFs = 'apfs' | 'hfs' | 'exfat' | 'fat32' | 'ntfs' | 'ext4' | 'btrfs' | 'xfs' | 'other';

export interface Drive {
  path: string;
  name: string;
  freeBytes: number;
  fsType: DriveFs;
  writable: boolean;
}

export interface DriveProbe {
  externalDrives(): Promise<Drive[]>;
}

/** diskutil and Linux file-system names → one short set. */
export function normalizeFs(raw: string): DriveFs {
  const fs = raw.toLowerCase();
  if (fs === 'apfs') return 'apfs';
  if (fs === 'hfs' || fs === 'hfs+') return 'hfs';
  if (fs === 'exfat') return 'exfat';
  if (fs === 'msdos' || fs === 'vfat' || fs === 'fat32') return 'fat32';
  if (fs === 'ntfs' || fs === 'ntfs3' || fs === 'fuseblk') return 'ntfs';
  if (fs === 'ext4' || fs === 'btrfs' || fs === 'xfs') return fs;
  return 'other';
}

/** The simple key/value pairs of a `diskutil info -plist` document. */
export function parsePlist(xml: string): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  const re = /<key>([^<]+)<\/key>\s*(?:<(string|integer)>([^<]*)<\/\2>|<(true|false)\/>)/g;
  for (const m of xml.matchAll(re)) {
    const [, key, tag, text, bool] = m;
    if (bool) out[key!] = bool === 'true';
    else out[key!] = tag === 'integer' ? Number(text) : text!;
  }
  return out;
}

/** Removable-media mounts from /proc/mounts (octal escapes like \040 decoded). */
export function parseMounts(text: string): Array<{ path: string; fsType: string }> {
  return text
    .split('\n')
    .map((line) => line.split(' '))
    .filter((f) => f.length >= 3)
    .map(([, mount, fsType]) => ({
      path: mount!.replace(/\\([0-7]{3})/g, (_, o: string) => String.fromCharCode(Number.parseInt(o, 8))),
      fsType: fsType!,
    }))
    .filter(({ path }) => /^\/(media|run\/media|mnt)\/./.test(path));
}

const canWrite = (path: string) =>
  access(path, constants.W_OK).then(
    () => true,
    () => false,
  );

async function freeBytes(path: string): Promise<number> {
  const s = await statfs(path);
  return s.bavail * s.bsize;
}

export class NodeDriveProbe implements DriveProbe {
  async externalDrives(): Promise<Drive[]> {
    return process.platform === 'darwin' ? this.mac() : this.linux();
  }

  private async mac(): Promise<Drive[]> {
    const names = await readdir('/Volumes').catch(() => [] as string[]);
    const drives: Drive[] = [];
    for (const name of names) {
      const path = join('/Volumes', name);
      const info = await promisify(execFile)('/usr/sbin/diskutil', ['info', '-plist', path], { timeout: 5_000 })
        .then((r) => parsePlist(r.stdout))
        .catch(() => null);
      // Not a disk (a network share) or the internal disk.
      if (!info || info.Internal !== false || typeof info.FilesystemType !== 'string') continue;
      drives.push({
        path,
        name: typeof info.VolumeName === 'string' ? info.VolumeName : name,
        freeBytes: await freeBytes(path).catch(() => 0),
        fsType: normalizeFs(info.FilesystemType),
        writable: info.WritableVolume === true && (await canWrite(path)),
      });
    }
    return drives;
  }

  private async linux(): Promise<Drive[]> {
    const mounts = parseMounts(await readFile('/proc/mounts', 'utf8').catch(() => ''));
    return Promise.all(
      mounts.map(async ({ path, fsType }) => ({
        path,
        name: basename(path),
        freeBytes: await freeBytes(path).catch(() => 0),
        fsType: normalizeFs(fsType),
        writable: await canWrite(path),
      })),
    );
  }
}
