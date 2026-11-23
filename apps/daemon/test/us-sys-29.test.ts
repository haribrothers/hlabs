// US-SYS-29 · See what hlabs connects to (server side): system.connections lists the app sources an admin added (each
// address), the registries the installed apps' images come from, the update server, Tailscale when it's set up (off
// while disconnected), each backup destination outside this computer, the ntfy server and the Pi-hole when chosen,
// with when each was last contacted; admins only.
import { appSources, backupDestinations, getSetting, setSetting } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { composeImages, recordContact, registryOf } from '../src/system/connections';
import type { Reply } from './admin-session';
import { installDaemon } from './install-harness';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-SYS-29', () => {
  it('names the registry of an image', () => {
    expect(registryOf('ghcr.io/immich-app/immich-server:v1')).toBe('ghcr.io');
    expect(registryOf('jellyfin/jellyfin:10')).toBe('docker.io');
    expect(registryOf('nginx')).toBe('docker.io');
    expect(registryOf('lscr.io/linuxserver/sonarr')).toBe('lscr.io');
    expect(composeImages('services:\n  web:\n    image: "a/b:1"\n  db:\n    image: postgres:16 # pinned\n')).toEqual([
      'a/b:1',
      'postgres:16',
    ]);
  });

  it('lists every outside service set up, with its last contact, and Off for one that is off', async () => {
    const t = await installDaemon(closers);
    t.s.appWatch.stop();
    const { db } = t.s;
    const before = (await t.d.query('system.connections')) as Reply;
    expect(before.result!.data.connections).toEqual([
      { id: 'updates', kind: 'updates', name: null, host: 'github.com', state: 'on', lastContactAt: null },
    ]);

    const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
    await t.s.jobs.settled(res.result!.data.jobId as string);
    db.insert(appSources)
      .values({
        id: 'lib',
        name: 'Family apps',
        url: 'https://github.com/anu/apps',
        kind: 'git',
        enabled: false,
        lastSyncedAt: 5,
      })
      .run();
    setSetting(db, 'remote', {
      ...getSetting(db, 'remote'),
      mode: 'tailscale',
      state: 'off',
      tailnetName: 'tail1.ts.net',
    });
    db.insert(backupDestinations)
      .values({
        id: 'b2',
        kind: 's3',
        name: 'Backblaze',
        configJson: { type: 'cloud', endpoint: 'https://s3.eu.backblazeb2.com', bucket: 'family', accessKey: 'k' },
        repoPasswordRef: 'backup:b2:password',
        createdAt: 1,
      })
      .run();
    db.insert(backupDestinations)
      .values({
        id: 'usb',
        kind: 'local',
        name: 'USB disk',
        configJson: { type: 'external', drivePath: '/Volumes/USB', driveName: 'USB', folder: 'hlabs-backups' },
        repoPasswordRef: 'backup:usb:password',
        createdAt: 1,
      })
      .run();
    recordContact(db, 'backup:b2', 42);
    setSetting(db, 'notifications', { tray: true, ntfy: { server: 'https://ntfy.sh', topic: 'x' } });
    const net = getSetting(db, 'network');
    setSetting(db, 'network', {
      ...net,
      dns: { ...net.dns, kind: 'pihole', address: 'http://192.168.1.2', lastSyncAt: 7 },
    });
    recordContact(db, 'updateCheck', 99);

    const list = ((await t.d.query('system.connections')) as Reply).result!.data.connections as Array<{
      id: string;
      state: string;
      host: string;
      lastContactAt: number | null;
    }>;
    expect(list.map((c) => c.id)).toEqual([
      'store:lib',
      'registry:docker.io',
      'updates',
      'tailscale',
      'backup:b2',
      'ntfy',
      'pihole',
    ]);
    const by = Object.fromEntries(list.map((c) => [c.id, c]));
    expect(by['store:lib']).toMatchObject({ host: 'https://github.com/anu/apps', state: 'off', lastContactAt: 5 });
    expect(by['registry:docker.io']!.lastContactAt).toEqual(expect.any(Number));
    expect(by.updates).toMatchObject({ lastContactAt: 99 });
    expect(by.tailscale).toMatchObject({ state: 'off', host: 'controlplane.tailscale.com' });
    expect(by['backup:b2']).toMatchObject({ host: 's3.eu.backblazeb2.com/family', lastContactAt: 42 });
    expect(by.ntfy).toMatchObject({ host: 'ntfy.sh', lastContactAt: null });
    expect(by.pihole).toMatchObject({ host: '192.168.1.2', lastContactAt: 7 });

    const anu = await memberSession(t.d);
    expect((await anu.query('system.connections')).error?.data.hlabsCode).toBe('ACCESS_DENIED');
  });
});
