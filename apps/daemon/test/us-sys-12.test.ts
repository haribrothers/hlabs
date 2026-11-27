// US-SYS-12 · Manage data location and drives (server side): storage.locations.list gives the storage root's path,
// the app data folder, and each drive's address and the apps using it; eject stops those apps and unmounts the drive,
// which stays remembered and offline (never mounted again by the minute's check) until "Try again".
import { appMounts, apps, auditLog, storageLocations } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { driveAddress, homeShort } from '../src/routers/storage';
import { FakeMounter } from './fakes/mounter';
import { filesDaemon } from './files-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const nas = { protocol: 'smb', host: 'nas.local', share: 'Media', username: 'hari', password: 'secret-pass' };

type Location = { id: string; address: string | null; displayPath: string; usedBy: string[]; status: string };

async function setup() {
  const mounter = new FakeMounter();
  const f = await filesDaemon(closers, { boot: { mounter, watchDrives: false } });
  const { locationId } = f.data<{ locationId: string }>(
    await f.d.mutate('storage.locations.addNetwork', { ...nas, name: 'NAS · Media' }),
  );
  const events: Array<{ locationId: string; change: string }> = [];
  f.d.services!.bus.on((e) => {
    if (e.event.type === 'storage.locationChanged') events.push(e.event.data);
  });
  const list = async () =>
    f.data<{ appDataPath: string; locations: Location[] }>(await f.d.query('storage.locations.list'));
  const drive = async () => (await list()).locations.find((l) => l.id === locationId)!;
  return { ...f, mounter, locationId, events, list, drive };
}

describe('US-SYS-12', () => {
  it('paths with ~ for the home folder, and a network drive by its address', () => {
    expect(homeShort(join(homedir(), 'hlabs'))).toBe('~/hlabs');
    expect(homeShort('/var/lib/hlabs/storage')).toBe('/var/lib/hlabs/storage');
    expect(driveAddress('smb', JSON.stringify({ host: 'nas.local', share: 'Media' }))).toBe('smb://nas.local/Media');
    expect(driveAddress('nfs', JSON.stringify({ host: 'nas.local', share: '/volume1/media' }))).toBe(
      'nfs://nas.local/volume1/media',
    );
    expect(driveAddress('external', null)).toBeNull();
  });

  it('lists the app data folder and each drive with its address and the apps that use it', async () => {
    const f = await setup();
    const listed = await f.list();
    expect(listed.appDataPath).toBe(homeShort(f.appDataDir));
    expect(listed.locations.find((l) => l.id === f.rootId)).toMatchObject({ address: null, usedBy: [] });
    expect(await f.drive()).toMatchObject({ address: 'smb://nas.local/Media', status: 'ok', usedBy: [] });
  });

  it('Disconnect stops the apps that use the drive, unmounts it and keeps it offline until Try again', async () => {
    const f = await setup();
    const s = f.d.services!;
    s.db
      .insert(apps)
      .values({ id: 'jellyfin', version: '1', state: 'running', hostname: 'jellyfin', installedAt: 1, updatedAt: 1 })
      .run();
    s.db
      .insert(appMounts)
      .values({ id: ulid(), appId: 'jellyfin', target: 'media', storageLocationId: f.locationId, subpath: '' })
      .run();
    const stopped: string[] = [];
    s.apps.stop = async (appId: string) => {
      stopped.push(appId);
      s.db.update(apps).set({ state: 'stopped' }).where(eq(apps.id, appId)).run();
    };
    expect((await f.drive()).usedBy).toEqual(['jellyfin']);
    const row = s.db.select().from(storageLocations).where(eq(storageLocations.id, f.locationId)).get()!;

    expect(f.data(await f.d.mutate('storage.locations.eject', { locationId: f.locationId }))).toEqual({
      ok: true,
      stoppedApps: ['jellyfin'],
    });
    expect(stopped).toEqual(['jellyfin']);
    expect(f.mounter.mounted.has(row.path)).toBe(false);
    expect(await f.drive()).toMatchObject({ status: 'ejected', address: 'smb://nas.local/Media' });
    expect(f.events.at(-1)).toEqual({ locationId: f.locationId, change: 'offline' });
    expect(s.db.select().from(auditLog).where(eq(auditLog.action, 'storage.eject')).get()).toMatchObject({
      target: f.locationId,
      detailJson: { name: 'NAS · Media', stoppedApps: ['jellyfin'] },
    });
    // Its password stays, for coming back.
    expect(await s.secrets.get(row.secretRef!)).toBe('secret-pass');

    // The minute's check leaves it alone, though it reconnects automatically.
    const mounts = f.mounter.shares.length;
    await s.networkDrives.check();
    expect(f.mounter.shares.length).toBe(mounts);
    expect((await f.drive()).status).toBe('ejected');

    // Try again brings it back.
    expect(f.data(await f.d.mutate('storage.locations.reconnect', { locationId: f.locationId }))).toEqual({
      status: 'ok',
    });
    expect(f.events.at(-1)).toEqual({ locationId: f.locationId, change: 'mounted' });
  });

  it("the storage root can't be ejected, and only admins can", async () => {
    const f = await setup();
    expect(f.code(await f.d.mutate('storage.locations.eject', { locationId: f.rootId }))).toBe('NOT_FOUND');
    expect(f.code(await f.anu.mutate('storage.locations.eject', { locationId: f.locationId }))).toBe('ACCESS_DENIED');
    expect((await f.drive()).status).toBe('ok');
  });
});
