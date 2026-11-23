// US-STORE-16 · Check for updates and auto-update in the background (server side): every 6 h the store is synced and
// app updates not told before are announced (an `app.updatesAvailable` event and one notification listing them); a
// higher revision counts; an update asking for new access never installs by itself; the night's updates wait for that
// night's backups; a `pre_update` backup runs before the pull, and without a destination the update goes on and says so.
import type { Job } from '@hlabs/api';
import { newAccess } from '@hlabs/app-manifest';
import { apps, backupRuns, getSetting, notifications, setSetting } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/events/bus';
import { silentLogger } from '../src/logger';
import { NotificationService } from '../src/notifications/service';
import { UPDATES_FOUND_KIND } from '../src/store/update-watch';
import { AutoUpdates } from '../src/updates/auto';
import { CHECK_EVERY_MS, HlabsUpdates } from '../src/updates/service';
import { backupsDaemon } from './backups-fixture';
import { FakeUpdateSource } from './fakes/update-source';
import { startDaemon } from './helpers';
import { withInstalled } from './update-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string } } };

describe('US-STORE-16 · finding updates', () => {
  it('syncs the store 6 hours after the last time, and every 6 hours after that', async () => {
    vi.useFakeTimers();
    const d = await startDaemon();
    closers.push(d.close);
    let syncs = 0;
    const updates = new HlabsUpdates({
      db: d.services!.db,
      bus: new EventBus(),
      logger: silentLogger(),
      source: new FakeUpdateSource(),
      version: '1.0.0',
      syncStore: () => void syncs++,
    });
    updates.start();
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS - 1);
    expect(syncs).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(syncs).toBe(1);
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(syncs).toBe(2);
    updates.stop();
  });

  it('a sync announces updates once: an event and one notification listing the apps; a newer one is told again', async () => {
    const t = await withInstalled(closers, ['uptime-kuma', 'vaultwarden']);
    const events: unknown[] = [];
    t.s.bus.on(({ event }) => {
      if (event.type === 'app.updatesAvailable') events.push(event.data);
    });
    const found = () => t.s.db.select().from(notifications).where(eq(notifications.kind, UPDATES_FOUND_KIND)).all();
    t.publish('uptime-kuma', '9.9.9');
    t.publish('vaultwarden', '9.9.9');
    await t.s.hlabsUpdates.check().catch(() => undefined);
    expect(events).toEqual([
      {
        apps: [
          { appId: 'uptime-kuma', name: 'Uptime Kuma', toVersion: '9.9.9' },
          { appId: 'vaultwarden', name: 'Vaultwarden', toVersion: '9.9.9' },
        ],
      },
    ]);
    expect(found().map((n) => [n.title, n.body, n.severity, n.userId])).toEqual([
      ['2 apps have updates', 'Uptime Kuma 9.9.9, Vaultwarden 9.9.9.', 'info', null],
    ]);
    // The next sync finds nothing new.
    await t.s.hlabsUpdates.check().catch(() => undefined);
    expect(found()).toHaveLength(1);
    t.publish('vaultwarden', '9.9.10');
    await t.s.hlabsUpdates.check().catch(() => undefined);
    expect(found().map((n) => n.title)).toEqual(['2 apps have updates', 'Vaultwarden has an update']);
  });

  it('a higher revision of the same version is an update', async () => {
    const t = await withInstalled(closers, ['uptime-kuma']);
    const version = t.s.db.select().from(apps).get()!.version;
    t.publish('uptime-kuma', version, (yml) => yml.replace(/^revision: .*$/m, 'revision: 2'));
    t.sync();
    const list = ((await t.d.query('store.listUpdates')) as Reply).result!.data as {
      pending: Array<{ appId: string; fromVersion: string; toVersion: string }>;
    };
    expect(list.pending).toMatchObject([{ appId: 'uptime-kuma', fromVersion: version, toVersion: version }]);
    const r = (await t.d.mutate('apps.update', { appId: 'uptime-kuma' })) as Reply;
    expect(r.error).toBeUndefined();
  });
});

describe('US-STORE-16 · new access', () => {
  it('lists only what an update adds: folders (or write access), ports and wider permissions', () => {
    const base = {
      folders: [{ key: 'photos', label: 'Photos', mode: 'ro' as const, required: true }],
      ports: [{ label: 'Web', host: 8080, container: 80, protocol: 'tcp' as const }],
      permissions: { network: 'lan' as const, gpu: false, dockerSocket: false },
    };
    expect(newAccess(base as never, base as never)).toBeNull();
    const next = {
      folders: [
        { key: 'photos', label: 'Photos', mode: 'rw' as const, required: true },
        { key: 'music', label: 'Music', mode: 'ro' as const, required: false },
      ],
      ports: [...base.ports, { label: 'Sync', host: 22000, container: 22000, protocol: 'udp' as const }],
      permissions: { network: 'internet' as const, gpu: true, dockerSocket: false },
    };
    expect(newAccess(base as never, next as never)).toEqual({
      folders: [
        { key: 'photos', label: 'Photos', mode: 'rw' },
        { key: 'music', label: 'Music', mode: 'ro' },
      ],
      ports: [{ label: 'Sync', host: 22000, protocol: 'udp' }],
      permissions: { network: 'internet', gpu: true, dockerSocket: false, devices: [], capabilities: [] },
    });
    // Less access isn't new access.
    expect(newAccess(next as never, base as never)).toBeNull();
  });

  it('the Updates list shows what a new version asks for', async () => {
    const t = await withInstalled(closers, ['uptime-kuma']);
    t.publish('uptime-kuma', '9.9.9', (yml) =>
      yml
        .replace(/^ports: .*$/m, '')
        .concat("ports:\n  - { service: uptime-kuma, label: 'Push', host: 3901, container: 3901, protocol: tcp }\n"),
    );
    t.sync();
    const list = ((await t.d.query('store.listUpdates')) as Reply).result!.data as {
      pending: Array<{ newAccess: unknown }>;
    };
    expect(list.pending[0]!.newAccess).toEqual({
      folders: [],
      ports: [{ label: 'Push', host: 3901, protocol: 'tcp' }],
      permissions: { network: null, gpu: false, dockerSocket: false, devices: [], capabilities: [] },
    });
  });
});

describe('US-STORE-16 · the night', () => {
  const at = (hour: number, minute = 0) => new Date(2026, 10, 3, hour, minute);

  async function night(opts: { newAccess?: string[]; backupsDue?: () => boolean } = {}) {
    const d = await startDaemon();
    closers.push(d.close);
    const db = d.services!.db;
    setSetting(db, 'updates', { ...getSetting(db, 'updates'), autoHlabs: false, autoApps: true });
    db.insert(apps)
      .values(
        ['immich', 'jellyfin'].map(
          (id) =>
            ({
              id,
              version: '1.0',
              autoUpdate: true,
              state: 'running',
              hostname: id,
              installedAt: 1,
              updatedAt: 1,
            }) as never,
        ),
      )
      .run();
    const started: string[] = [];
    let now = at(3, 10);
    const auto = new AutoUpdates({
      db,
      bus: new EventBus(),
      jobs: { blocker: () => null, listActive: () => [] as Job[] },
      catalog: { get: (id: string) => ({ manifest: { name: id, version: '2.0' } }) as never },
      notifications: new NotificationService(db, new EventBus()),
      logger: silentLogger(),
      hlabs: { available: () => null, install: () => {} },
      updateApp: (appId) => {
        started.push(appId);
        return `job-${appId}`;
      },
      findUpdate: (appId) => ({ to: '2.0', newAccess: (opts.newAccess ?? []).includes(appId) }),
      backupsDue: opts.backupsDue,
      now: () => now,
    });
    return { auto, started, at: (d: Date) => (now = d) };
  }

  it('an update asking for new access is skipped; the others go ahead', async () => {
    const s = await night({ newAccess: ['immich'] });
    s.auto.tick();
    expect(s.started).toEqual(['jellyfin']);
  });

  it('waits for that night’s backups, then updates within the window', async () => {
    let due = true;
    const s = await night({ backupsDue: () => due });
    s.auto.tick();
    expect(s.started).toEqual([]);
    due = false;
    s.at(at(3, 40));
    s.auto.tick();
    expect(s.started).toEqual(['immich', 'jellyfin']);
  });

  it('a backup is due tonight until the scheduled one has run', async () => {
    const b = await backupsDaemon(closers);
    await b.nasDestination();
    const day = (h: number, m = 0) => new Date(2026, 10, 3, h, m).getTime();
    const end = day(5);
    // The plan backs up at 03:00 by default.
    setSetting(b.s.db, 'backupSchedule', { lastSlot: day(3) - 86_400_000, retryAt: null });
    expect(b.s.backups.dueBefore(end, day(2, 50))).toBe(true);
    expect(b.s.backups.dueBefore(end, day(3, 0))).toBe(true);
    setSetting(b.s.db, 'backupSchedule', { lastSlot: day(3), retryAt: null });
    expect(b.s.backups.dueBefore(end, day(3, 30))).toBe(false);
  });
});

describe('US-STORE-16 · backing up first', () => {
  it('a pre_update run backs up that app to each destination', async () => {
    const b = await backupsDaemon(closers);
    b.app('immich', { name: 'Immich' });
    b.app('jellyfin', { name: 'Jellyfin' });
    const signal = new AbortController().signal;
    expect(await b.s.backups.beforeUpdate('immich', { jobId: 'j', target: 'immich', signal }, () => {})).toBe(
      'no_destination',
    );
    await b.nasDestination();
    expect(await b.s.backups.beforeUpdate('immich', { jobId: 'j', target: 'immich', signal }, () => {})).toBe('done');
    const runs = b.s.db.select().from(backupRuns).all();
    expect(runs.map((r) => [r.trigger, r.status, r.appCount])).toEqual([['pre_update', 'succeeded', 1]]);
    const tags = b.restic.calls.filter((c) => c.op === 'backup').map((c) => (c.detail as { tags: string[] }).tags[0]);
    expect(tags).toEqual(['app:immich', 'system']);
  });

  it('the backup comes before the download; without it asked for, there is none', async () => {
    const t = await withInstalled(closers, ['uptime-kuma']);
    const order: string[] = [];
    t.s.backups.beforeUpdate = async () => {
      order.push(`backup after ${t.engine.pulls.length} pulls`);
      return 'done';
    };
    const pullsBefore = t.engine.pulls.length;
    t.publish('uptime-kuma', '9.9.9');
    t.sync();
    let r = (await t.d.mutate('apps.update', { appId: 'uptime-kuma' })) as Reply;
    await t.s.jobs.settled(r.result!.data.jobId as string);
    expect(order).toEqual([`backup after ${pullsBefore} pulls`]);
    expect(t.engine.pulls.length).toBeGreaterThan(pullsBefore);

    // Neither the setting nor the new version asks for one.
    setSetting(t.s.db, 'updates', { ...getSetting(t.s.db, 'updates'), backupBeforeUpdate: false });
    t.publish('uptime-kuma', '9.9.10', (yml) => yml.replace('beforeUpdate: true', 'beforeUpdate: false'));
    t.sync();
    r = (await t.d.mutate('apps.update', { appId: 'uptime-kuma' })) as Reply;
    await t.s.jobs.settled(r.result!.data.jobId as string);
    expect(order).toHaveLength(1);
  });
});
