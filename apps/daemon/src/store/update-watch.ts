// Finding app updates (US-STORE-16): after each store sync (at start and every 6 h with hlabs's update check), installed
// apps whose listing has a newer version or revision are announced once: an `app.updatesAvailable` event and one info
// notification for the admins listing them. An update already announced isn't told again; a newer one is.
import type { AppManifest } from '@hlabs/app-manifest';
import { apps, getSetting, setSetting, type HlabsDb } from '@hlabs/db';
import type { EventBus } from '../events/bus';
import type { NotificationService } from '../notifications/service';
import { pendingUpdate } from './updates-list';

export const UPDATES_FOUND_KIND = 'store.updates_available';

export interface UpdateWatchDeps {
  db: HlabsDb;
  bus: EventBus;
  notifications: Pick<NotificationService, 'create'>;
  installed: (appId: string) => AppManifest | null;
}

const keyOf = (m: { version: string; revision: number }) => `${m.version}#${m.revision}`;

export class StoreUpdateWatch {
  constructor(private readonly deps: UpdateWatchDeps) {}

  /** Announces the updates found since the last sync; returns their app ids. */
  afterSync(): string[] {
    const { db, bus } = this.deps;
    const found = db
      .select()
      .from(apps)
      .all()
      .flatMap((app) => {
        const u = pendingUpdate(db, app, this.deps.installed);
        return u ? [{ appId: app.id, name: u.store.name, toVersion: u.store.version, key: keyOf(u.store) }] : [];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const u = getSetting(db, 'updates');
    const fresh = found.filter((f) => u.announcedApps[f.appId] !== f.key);
    // Only what's still waiting is remembered, so an app updated and then behind again is told again.
    setSetting(db, 'updates', { ...u, announcedApps: Object.fromEntries(found.map((f) => [f.appId, f.key])) });
    if (!fresh.length) return [];
    const list = fresh.map(({ appId, name, toVersion }) => ({ appId, name, toVersion }));
    bus.emit('app.updatesAvailable', { apps: list }, { kind: 'admins' });
    this.deps.notifications.create({
      userId: null,
      kind: UPDATES_FOUND_KIND,
      severity: 'info',
      title: fresh.length === 1 ? `${fresh[0]!.name} has an update` : `${fresh.length} apps have updates`,
      body: `${list.map((f) => `${f.name} ${f.toVersion}`).join(', ')}.`,
      actions: [{ kind: 'navigate', to: '/store/updates' }],
    });
    return list.map((f) => f.appId);
  }
}
