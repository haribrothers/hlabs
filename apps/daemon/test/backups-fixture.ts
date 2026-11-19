// A daemon ready for the backup stories (08-usage-backups): Files' fixture (a storage root, Hari the admin, Anu a
// member), the fake restic, a fake mounter for network drives and a fake external drive on "another disk".
import type { AppManifest } from '@hlabs/app-manifest';
import { apps, storageLocations } from '@hlabs/db';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BootDeps } from '../src/boot';
import type { Drive } from '../src/platform/drives';
import { FakeEngine } from './fakes/engine';
import { FakeMounter } from './fakes/mounter';
import { FakeRestic } from './fakes/restic';
import { filesDaemon } from './files-fixture';
import { tempDir } from './helpers';

export async function backupsDaemon(closers: Array<() => Promise<void>>, opts: { boot?: Partial<BootDeps> } = {}) {
  const restic = new FakeRestic();
  const mounter = new FakeMounter();
  const usb = tempDir('usb-');
  const drives: Drive[] = [{ path: usb, name: 'Backup disk', freeBytes: 1.4e12, fsType: 'exfat', writable: true }];
  const engine = new FakeEngine();
  const f = await filesDaemon(closers, {
    engine,
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
  const s = f.d.services!;
  /**
   * An installed app as a backup sees it: its row, its manifest copy (with `backup`), data in `app-data/<id>` and,
   * when running, a container per service.
   */
  const app = (
    id: string,
    opts: {
      name?: string;
      state?: 'running' | 'stopped' | 'error';
      backup?: Partial<AppManifest['backup']>;
      services?: string[];
    } = {},
  ) => {
    const state = opts.state ?? 'running';
    s.db
      .insert(apps)
      .values({
        id,
        sourceId: null,
        version: '1.0.0',
        state,
        hostname: id,
        portFallback: 12000 + s.db.select().from(apps).all().length,
        authMode: 'hlabs',
        installedAt: 1,
        updatedAt: 1,
      })
      .run();
    const project = s.apps.project(id);
    mkdirSync(project.dir, { recursive: true });
    writeFileSync(
      join(project.dir, 'hlabs-app.json'),
      JSON.stringify({
        id,
        name: opts.name ?? id,
        backup: { pause: [], exclude: [], beforeUpdate: false, ...opts.backup },
      }),
    );
    const data = join(s.config.paths.appDataDir, id);
    mkdirSync(join(data, 'db'), { recursive: true });
    writeFileSync(join(data, 'db', 'data.sqlite'), `${id} data`);
    const services = opts.services ?? ['server'];
    engine.containers.set(
      project.name,
      services.map((service, i) => ({
        id: `${id}-${service}-${i}`,
        service,
        state: state === 'running' ? 'running' : 'exited',
        health: null,
        image: `${id}:1`,
        imageId: `sha256:${id}`,
        startedAt: 1,
        exitCode: null,
      })),
    );
    return { data, project };
  };
  /** A destination on a connected NAS, added through the API. */
  const nasDestination = async (name = 'NAS') => {
    const nas = nasDrive(`nas-${name}`, `${name} · Backups`);
    const res = await f.d.mutate('backups.destinations.add', {
      name,
      repoPassword: PASSWORD,
      target: { type: 'network', locationId: nas.id },
    });
    return { ...nas, destinationId: f.data<{ destinationId: string }>(res).destinationId };
  };
  return { ...f, restic, mounter, engine, usb, drives, nasDrive, nasDestination, app, s };
}

export const PASSWORD = 'maple-orbit-tundra-cobalt-ferry-quill';
