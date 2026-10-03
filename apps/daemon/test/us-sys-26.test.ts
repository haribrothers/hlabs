// US-SYS-26 · Choose automatic updates (server side): inside 03:00–05:00 local time, hlabs first and then the apps
// allowed to update by themselves; a running backup or blocking job is waited for; once a night; a notification says
// what was updated or rolled back.
import type { Job } from '@hlabs/api';
import { apps, auditLog, getSetting, notifications, setSetting } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { EventBus } from '../src/events/bus';
import { silentLogger } from '../src/logger';
import { NotificationService } from '../src/notifications/service';
import { AUTO_UPDATED_KIND, AutoUpdates } from '../src/updates/auto';
import { startSystemUpdate } from '../src/updates/install';
import { daemonWithAdmin } from './admin-session';
import { FakeUpdateSource } from './fakes/update-source';
import { startDaemon } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);
const STORE: Record<string, { name: string; version: string }> = {
  immich: { name: 'Immich', version: '1.3' },
  jellyfin: { name: 'Jellyfin', version: '10.9' },
  vault: { name: 'Vaultwarden', version: '1.30' },
};

async function setup(opts: { hlabs?: string | null; autoHlabs?: boolean; autoApps?: boolean } = {}) {
  const d = await startDaemon();
  closers.push(d.close);
  const db = d.services!.db;
  setSetting(db, 'updates', {
    ...getSetting(db, 'updates'),
    autoHlabs: opts.autoHlabs ?? true,
    autoApps: opts.autoApps ?? true,
  });
  db.insert(apps)
    .values(
      (
        [
          ['immich', '1.2', true],
          ['jellyfin', '10.8', true],
          ['vault', '1.30', true],
          ['paper', '2.0', false],
        ] as const
      ).map(
        ([id, version, autoUpdate]) =>
          ({ id, version, autoUpdate, state: 'running', hostname: id, installedAt: 1, updatedAt: 1 }) as never,
      ),
    )
    .run();
  const bus = new EventBus();
  const active: Job[] = [];
  let blocker: string | null = null;
  let now = at(3, 3, 10);
  const installs: string[] = [];
  const started: string[] = [];
  const auto = new AutoUpdates({
    db,
    bus,
    jobs: { blocker: () => blocker, listActive: () => active },
    catalog: { get: (id: string) => (STORE[id] ? ({ manifest: STORE[id] } as never) : null) },
    notifications: new NotificationService(db, bus),
    logger: silentLogger(),
    hlabs: {
      available: () => (opts.hlabs === undefined ? '1.5.0' : opts.hlabs),
      install: () => void installs.push('hlabs'),
    },
    updateApp: (appId) => {
      started.push(appId);
      return `job-${appId}`;
    },
    now: () => now,
  });
  return {
    db,
    bus,
    auto,
    installs,
    started,
    active,
    setBlocker: (b: string | null) => (blocker = b),
    at: (d: Date) => (now = d),
  };
}

const job = (kind: string) => ({ id: kind, kind }) as Job;

describe('US-SYS-26 · Choose automatic updates', () => {
  it('nothing outside 03:00–05:00', async () => {
    const s = await setup();
    for (const d of [at(3, 2, 59), at(3, 5, 0), at(3, 14)]) {
      s.at(d);
      s.auto.tick();
    }
    expect(s.installs).toEqual([]);
    expect(s.started).toEqual([]);
  });

  it('hlabs first, once a night; then the apps allowed to update with a newer version', async () => {
    const s = await setup();
    s.auto.tick();
    expect(s.installs).toEqual(['hlabs']);
    expect(s.started).toEqual([]);
    // hlabs is updating: the apps wait for it.
    s.active.push(job('system_update'));
    s.auto.tick();
    expect(s.started).toEqual([]);
    s.active.length = 0;
    s.at(at(3, 3, 40));
    s.auto.tick();
    // Immich and Jellyfin have newer versions; Vaultwarden is current; Paperless isn't allowed.
    expect(s.installs).toEqual(['hlabs']);
    expect(s.started).toEqual(['immich', 'jellyfin']);
    s.auto.tick();
    expect(s.started).toHaveLength(2);
    // The next night they're due again (if still behind).
    s.at(at(4, 3, 5));
    s.auto.tick();
    expect(s.installs).toEqual(['hlabs', 'hlabs']);
  });

  it('waits for a running backup or a job that blocks it, still within the window', async () => {
    const s = await setup();
    s.active.push(job('backup'));
    s.auto.tick();
    expect(s.installs).toEqual([]);
    s.active.length = 0;
    s.setBlocker('restore');
    s.auto.tick();
    expect(s.installs).toEqual([]);
    s.setBlocker(null);
    s.at(at(3, 4, 55));
    s.auto.tick();
    expect(s.installs).toEqual(['hlabs']);
  });

  it('with the switches off, nothing updates by itself', async () => {
    const s = await setup({ autoHlabs: false, autoApps: false });
    s.auto.tick();
    expect(s.installs).toEqual([]);
    expect(s.started).toEqual([]);
  });

  it('a notification says what was updated or rolled back', async () => {
    const s = await setup({ hlabs: null });
    s.auto.tick();
    expect(s.started).toEqual(['immich', 'jellyfin']);
    const finished = (jobId: string, state: 'succeeded' | 'failed') =>
      s.bus.emit('job.finished', { jobId, kind: 'app_update', target: null, state, hlabsCode: null });
    finished('job-immich', 'succeeded');
    expect(s.db.select().from(notifications).all()).toHaveLength(0);
    finished('job-jellyfin', 'failed');
    const note = s.db.select().from(notifications).where(eq(notifications.kind, AUTO_UPDATED_KIND)).get();
    expect(note?.title).toBe('Updated 1 of 2 apps overnight');
    expect(note?.body).toBe('Updated: Immich 1.2 → 1.3. Rolled back: Jellyfin 10.8 → 10.9.');
    expect(note?.severity).toBe('warning');
  });

  it('settings.updates.setAuto keeps the switches and is audited', async () => {
    const d = await daemonWithAdmin(closers);
    const input = { hlabs: false, apps: true, backupBeforeUpdate: false };
    expect((await d.mutate('settings.updates.setAuto', input)).result?.data).toEqual({ ok: true });
    const status = (await d.query('settings.updates.get')).result!.data as Record<string, unknown>;
    expect(status).toMatchObject({ autoHlabs: false, autoApps: true, backupBeforeUpdate: false });
    const row = d.services!.db.select().from(auditLog).where(eq(auditLog.action, 'settings.updates.auto')).get();
    expect(row?.detailJson).toEqual(input);
  });

  it('an automatic hlabs update that finished says so after the restart', async () => {
    const source = new FakeUpdateSource();
    source.releases.stable = { version: '1.5.0' };
    const d = await daemonWithAdmin(closers, { version: '1.4.0' }, { updateSource: source });
    await d.mutate('settings.updates.check');
    startSystemUpdate(d.services!.systemUpdate, null);
    await d.close();
    closers.splice(closers.indexOf(d.close), 1);
    const next = await daemonWithAdmin(closers, { version: '1.5.0', paths: d.config.paths }, { updateSource: source });
    const note = next.services!.db.select().from(notifications).where(eq(notifications.kind, AUTO_UPDATED_KIND)).get();
    expect(note?.title).toBe('hlabs updated to 1.5.0 overnight');
  });
});
