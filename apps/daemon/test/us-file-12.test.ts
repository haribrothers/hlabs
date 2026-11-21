// US-FILE-12 · Disconnect or recover a network drive (server side): a drive that can't be reached is offline and its
// folders answer NAS_UNREACHABLE; Try again mounts it; Disconnect unmounts it, deletes its password and forgets it,
// unless an app keeps folders there; status changes go out as storage.locationChanged.
import { appMounts, apps, auditLog, storageLocations } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeMounter } from './fakes/mounter';
import { filesDaemon } from './files-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const nas = { protocol: 'smb', host: 'nas.local', share: 'Media', username: 'hari', password: 'secret-pass' };

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
  return { ...f, mounter, locationId, events };
}

describe('US-FILE-12', () => {
  it('a drive that stops answering is offline, its folders say so, and Try again brings it back', async () => {
    const f = await setup();
    f.mounter.mounted.clear();
    f.mounter.fail = 'NAS_UNREACHABLE';
    await f.d.services!.networkDrives.check();
    expect(f.events).toEqual([{ locationId: f.locationId, change: 'offline' }]);
    const list = await f.d.query('files.list', { path: `/drives/${f.locationId}` });
    expect(list.error?.data).toMatchObject({ hlabsCode: 'NAS_UNREACHABLE', detail: { location: 'NAS · Media' } });
    expect(f.data(await f.d.mutate('storage.locations.reconnect', { locationId: f.locationId }))).toEqual({
      status: 'unreachable',
    });
    f.mounter.fail = null;
    expect(f.data(await f.d.mutate('storage.locations.reconnect', { locationId: f.locationId }))).toEqual({
      status: 'ok',
    });
    expect(f.events.at(-1)).toEqual({ locationId: f.locationId, change: 'mounted' });
    expect(
      f.data<{ place: { area: string } }>(await f.d.query('files.list', { path: `/drives/${f.locationId}` })).place
        .area,
    ).toBe('drive');
  });

  it('an app that keeps folders on the drive stops it being disconnected, and is named', async () => {
    const f = await setup();
    f.db
      .insert(apps)
      .values({ id: 'jellyfin', version: '1', state: 'running', hostname: 'jellyfin', installedAt: 1, updatedAt: 1 })
      .run();
    f.db
      .insert(appMounts)
      .values({ id: ulid(), appId: 'jellyfin', target: 'media', storageLocationId: f.locationId, subpath: '' })
      .run();
    const list = f.data<{ locations: Array<{ id: string; usedBy: string[] }> }>(
      await f.d.query('storage.locations.list'),
    );
    expect(list.locations.find((l) => l.id === f.locationId)!.usedBy).toEqual(['jellyfin']);
    const r = await f.d.mutate('storage.locations.remove', { locationId: f.locationId });
    expect(r.error?.data).toMatchObject({ hlabsCode: 'STORAGE_LOCATION_IN_USE', detail: { apps: ['jellyfin'] } });
    expect(f.db.select().from(storageLocations).where(eq(storageLocations.id, f.locationId)).get()).toBeDefined();
  });

  it("Disconnect unmounts it, deletes its password and forgets it; the storage root can't be disconnected", async () => {
    const f = await setup();
    const row = f.db.select().from(storageLocations).where(eq(storageLocations.id, f.locationId)).get()!;
    expect(f.data(await f.d.mutate('storage.locations.remove', { locationId: f.locationId }))).toEqual({ ok: true });
    expect(f.mounter.mounted.has(row.path)).toBe(false);
    expect(await f.d.services!.secrets.get(row.secretRef!)).toBeNull();
    expect(f.db.select().from(storageLocations).where(eq(storageLocations.id, f.locationId)).get()).toBeUndefined();
    expect(f.db.select().from(auditLog).where(eq(auditLog.action, 'storage.removeNetwork')).get()).toMatchObject({
      target: f.locationId,
      detailJson: { name: 'NAS · Media', protocol: 'smb' },
    });
    expect(f.events.at(-1)).toEqual({ locationId: f.locationId, change: 'removed' });
    expect(f.code(await f.d.mutate('storage.locations.remove', { locationId: f.rootId }))).toBe('NOT_FOUND');
    expect(f.code(await f.anu.mutate('storage.locations.remove', { locationId: f.rootId }))).toBe('ACCESS_DENIED');
  });
});
