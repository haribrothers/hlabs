// US-ONB-15 · Use an external drive (server side).
import { getSetting, storageLocations } from '@hlabs/db';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeFs, parseMounts, parsePlist, type Drive } from '../src/platform/drives';
import { daemonWithAdmin } from './admin-session';
import { tempDir } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function withDrives(drives: Drive[]) {
  const d = await daemonWithAdmin(closers, {}, { drives: { externalDrives: async () => drives } });
  await d.mutate('onboarding.setStep', { step: 'storage' });
  return d;
}

const drive = (over: Partial<Drive> = {}): Drive => ({
  path: tempDir('drive-'),
  name: 'Samsung_T5',
  freeBytes: 900e9,
  fsType: 'apfs',
  writable: true,
  ...over,
});

describe('US-ONB-15', () => {
  it('lists connected drives hlabs can write to', async () => {
    const good = drive();
    const d = await withDrives([good, drive({ name: 'Read only', writable: false })]);
    expect((await d.query('storage.listDrives')).result?.data).toEqual({ drives: [good] });
  });

  it('a chosen drive holds <drive>/hlabs as the root; app data stays on this computer', async () => {
    const t5 = drive({ fsType: 'exfat' });
    const d = await withDrives([t5]);
    expect((await d.mutate('onboarding.setStorage', { kind: 'external', path: t5.path })).result?.data).toEqual({
      ok: true,
    });
    const root = join(t5.path, 'hlabs');
    for (const dir of ['users/hari', 'shared', '.trash']) expect(statSync(join(root, dir)).isDirectory()).toBe(true);
    const db = d.services!.db;
    expect(db.select().from(storageLocations).all()).toEqual([
      expect.objectContaining({ kind: 'external', name: 'Samsung_T5', path: root, isRoot: true }),
    ]);
    expect(d.config.paths.appDataDir.startsWith(t5.path)).toBe(false);
    // Phase 2: on to the starter apps.
    expect(getSetting(db, 'onboarding').step).toBe('remote');
  });

  it('refuses a drive that was ejected or cannot be written', async () => {
    const readOnly = drive({ writable: false });
    const d = await withDrives([readOnly]);
    expect(
      (await d.mutate('onboarding.setStorage', { kind: 'external', path: '/Volumes/Gone' })).error?.data.hlabsCode,
    ).toBe('NOT_FOUND');
    expect(
      (await d.mutate('onboarding.setStorage', { kind: 'external', path: readOnly.path })).error?.data.hlabsCode,
    ).toBe('NOT_FOUND');
    expect(d.services!.db.select().from(storageLocations).all()).toEqual([]);
  });
});

describe('US-ONB-15 drive detection', () => {
  it('reads diskutil plists', () => {
    const xml = `<dict><key>FilesystemType</key>\n\t<string>exfat</string><key>Internal</key>\n\t<false/>
      <key>VolumeName</key><string>Samsung_T5</string><key>WritableVolume</key><true/><key>Size</key><integer>500</integer></dict>`;
    expect(parsePlist(xml)).toEqual({
      FilesystemType: 'exfat',
      Internal: false,
      VolumeName: 'Samsung_T5',
      WritableVolume: true,
      Size: 500,
    });
  });

  it('finds removable-media mounts on Linux, decoding spaces', () => {
    const mounts = [
      '/dev/nvme0n1p2 / ext4 rw 0 0',
      '/dev/sda1 /media/hari/My\\040Drive exfat rw 0 0',
      '/dev/sdb1 /run/media/hari/Backup ext4 rw 0 0',
      'tmpfs /run tmpfs rw 0 0',
    ].join('\n');
    expect(parseMounts(mounts)).toEqual([
      { path: '/media/hari/My Drive', fsType: 'exfat' },
      { path: '/run/media/hari/Backup', fsType: 'ext4' },
    ]);
  });

  it('names file systems in one short set', () => {
    expect(normalizeFs('msdos')).toBe('fat32');
    expect(normalizeFs('vfat')).toBe('fat32');
    expect(normalizeFs('ExFAT')).toBe('exfat');
    expect(normalizeFs('apfs')).toBe('apfs');
    expect(normalizeFs('fuseblk')).toBe('ntfs');
    expect(normalizeFs('zfs')).toBe('other');
  });
});
