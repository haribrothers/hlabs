// US-APP-17 · Folder access: apps.getConfig lists the folders an app can reach with where they are ("Home ›
// Documents", "Shared › Backups", a drive by name), their mode and the manifest's label, whether the drive is connected,
// the manifest folders it hasn't been given and the devices it asked for. apps.setPermissions gives and takes folders
// (one of its own is mounted at /mnt/hlabs/<name>), checked like an install's; a required folder can't be removed.
import { appMounts, storageLocations } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { settingsApp } from './config-fixture';
import { installDaemon } from './install-harness';
import { tempDir } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Folder = {
  target: string;
  mode: string;
  place: { area: string; locationName: string | null; path: string };
  filesPath: string;
  available: boolean;
  folder: { key: string; label: string; required: boolean } | null;
};
type Config = {
  folders: Folder[];
  folderRequests: Array<{ key: string; label: string }>;
  devices: { gpu: boolean; list: Array<{ path: string; label: string }>; capabilities: string[] };
};

const net = { internet: true, apps: true };

describe('US-APP-17', () => {
  it('lists no folders yet, the manifest folder it may be given, and no devices', async () => {
    const t = await settingsApp(closers);
    const config = (await t.config()) as Config;
    expect(config.folders).toEqual([]);
    expect(config.folderRequests).toEqual([
      { key: 'attachments', label: 'Attachments to import', description: 'For importing attachments', mode: 'rw' },
    ]);
    expect(config.devices).toEqual({ gpu: false, list: [], capabilities: [] });
  });

  it('gives a manifest folder read only and a folder of its own, mounted at /mnt/hlabs/<name>', async () => {
    const t = await settingsApp(closers);
    const { job } = await t.save('apps.setPermissions', {
      mounts: [
        { target: 'attachments', storageLocationId: 'root', subpath: 'users/hari/Documents', mode: 'ro' },
        { target: '/mnt/hlabs/Backups', storageLocationId: 'root', subpath: 'shared/Backups', mode: 'rw' },
      ],
      network: net,
    });
    expect(job?.state).toBe('succeeded');
    const config = (await t.config()) as Config;
    expect(config.folders).toEqual([
      expect.objectContaining({
        target: 'attachments',
        mode: 'ro',
        place: { area: 'home', locationName: null, path: 'Documents' },
        filesPath: '/home/Documents',
        available: true,
        folder: expect.objectContaining({ key: 'attachments', label: 'Attachments to import', required: false }),
      }),
      expect.objectContaining({
        target: '/mnt/hlabs/Backups',
        mode: 'rw',
        place: { area: 'shared', locationName: null, path: 'Backups' },
        filesPath: '/shared/Backups',
        folder: null,
      }),
    ]);
    expect(config.folderRequests).toEqual([]);
    // Made before the app started, and in its compose file.
    expect(existsSync(join(t.root, 'shared', 'Backups'))).toBe(true);
    const compose = parse(t.file('docker-compose.yml')) as { services: { vaultwarden: { volumes: unknown[] } } };
    expect(compose.services.vaultwarden.volumes).toContain('${HLABS_FOLDER_ATTACHMENTS}:/import:ro');
    expect(compose.services.vaultwarden.volumes).toContainEqual({
      type: 'bind',
      source: join(t.root, 'shared', 'Backups'),
      target: '/mnt/hlabs/Backups',
    });
    expect(t.audits('app.setPermissions')).toHaveLength(1);

    // Taken away again.
    await t.save('apps.setPermissions', { mounts: [], network: net });
    const after = parse(t.file('docker-compose.yml')) as { services: { vaultwarden: { volumes: unknown[] } } };
    expect(JSON.stringify(after.services.vaultwarden.volumes)).not.toMatch(/import|mnt\/hlabs/);
  });

  it.each([
    ['a folder the manifest does not have', { target: 'photos', subpath: 'shared/x' }],
    ['a name with a slash', { target: '/mnt/hlabs/a/b', subpath: 'shared/x' }],
    ['a name that leaves /mnt/hlabs', { target: '/mnt/hlabs/..', subpath: 'shared/x' }],
    ['a path that leaves its drive', { target: '/mnt/hlabs/Etc', subpath: '../../etc' }],
  ])('refuses %s', async (_what, m) => {
    const t = await settingsApp(closers);
    const { reply } = await t.save('apps.setPermissions', {
      mounts: [{ storageLocationId: 'root', mode: 'rw', ...m }],
      network: net,
    });
    expect(reply.error?.data.hlabsCode).toBe('VALIDATION_FAILED');
    expect(t.audits('app.setPermissions')).toEqual([]);
  });

  it('a required folder can be moved but not removed', async () => {
    const t = await installDaemon(closers);
    const res = await t.d.mutate('apps.install', {
      appId: 'immich',
      mounts: [{ target: 'library', storageLocationId: 'root', subpath: 'users/hari/Photos', mode: 'rw' }],
    });
    await t.s.jobs.settled(res.result!.data.jobId as string);
    const removed = await t.d.mutate('apps.setPermissions', { appId: 'immich', mounts: [], network: net });
    expect(removed.error?.data).toMatchObject({ hlabsCode: 'VALIDATION_FAILED', detail: { folder: 'library' } });
    const moved = await t.d.mutate('apps.setPermissions', {
      appId: 'immich',
      mounts: [{ target: 'library', storageLocationId: 'root', subpath: 'shared/Photos', mode: 'rw' }],
      network: net,
    });
    const job = await t.s.jobs.settled(moved.result!.data.jobId as string);
    expect(job?.state).toBe('succeeded');
  });

  it('a network drive that is offline shows as not connected, and saving keeps it', async () => {
    const t = await settingsApp(closers);
    const nas = tempDir('nas-');
    mkdirSync(join(nas, 'Backups'), { recursive: true });
    t.s.db
      .insert(storageLocations)
      .values({ id: 'nas', kind: 'smb', name: 'NAS', path: nas, status: 'offline', appsAllowed: true } as never)
      .run();
    t.s.db
      .insert(appMounts)
      .values({
        id: ulid(),
        appId: 'vaultwarden',
        target: '/mnt/hlabs/Backups',
        storageLocationId: 'nas',
        subpath: 'Backups',
        mode: 'rw',
      })
      .run();
    const config = (await t.config()) as Config;
    expect(config.folders).toEqual([
      expect.objectContaining({
        place: { area: 'location', locationName: 'NAS', path: 'Backups' },
        filesPath: '/drives/nas/Backups',
        available: false,
      }),
    ]);
    const kept = await t.save('apps.setPermissions', {
      mounts: [{ target: '/mnt/hlabs/Backups', storageLocationId: 'nas', subpath: 'Backups', mode: 'rw' }],
      network: net,
    });
    expect(kept.job?.state).toBe('succeeded');
    // A new folder on it is refused while it's offline.
    const added = await t.save('apps.setPermissions', {
      mounts: [
        { target: '/mnt/hlabs/Backups', storageLocationId: 'nas', subpath: 'Backups', mode: 'rw' },
        { target: '/mnt/hlabs/Other', storageLocationId: 'nas', subpath: 'Other', mode: 'rw' },
      ],
      network: net,
    });
    expect(added.reply.error?.data.hlabsCode).toBe('NAS_UNREACHABLE');
  });

  it('lists the devices it asked for, read only (D-163)', async () => {
    const t = await settingsApp(closers, {
      permissions: '{ network: internet, devices: [{ path: /dev/ttyUSB0, label: Zigbee USB adapter }] }',
    });
    const config = (await t.config()) as Config;
    expect(config.devices.list).toEqual([{ path: '/dev/ttyUSB0', label: 'Zigbee USB adapter' }]);
  });
});
