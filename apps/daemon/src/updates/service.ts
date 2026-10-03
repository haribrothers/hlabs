// hlabs's own updates (US-SYS-24): checks the update manifest on the chosen channel, now ("Check now") and every 6 h,
// and refreshes the store index with it (02 §2.10). What the last check found is kept in `settings.updates`; a check
// that fails (offline) keeps the previous result. Each newer version is announced once with `update.available`.
import type { UpdateStatus } from '@hlabs/api';
import { getSetting, setSetting, type HlabsDb } from '@hlabs/db';
import type { EventBus } from '../events/bus';
import type { Logger } from '../logger';
import { noteBullets, type UpdateSource } from './source';
import { compareVersions } from './version';

export const CHECK_EVERY_MS = 6 * 60 * 60_000;

export interface HlabsUpdatesDeps {
  db: HlabsDb;
  bus: EventBus;
  logger: Logger;
  source: UpdateSource;
  /** The version running now. */
  version: string;
  /** Refreshes the store index (built-in store; other sources from phase 7). */
  syncStore: () => void;
  now?: () => number;
}

export class HlabsUpdates {
  private timer: NodeJS.Timeout | null = null;
  private checking: Promise<UpdateStatus> | null = null;

  constructor(private readonly deps: HlabsUpdatesDeps) {}

  status(): UpdateStatus {
    const u = getSetting(this.deps.db, 'updates');
    const latest = u.latest && compareVersions(u.latest.version, this.deps.version) > 0 ? u.latest : null;
    return {
      version: this.deps.version,
      channel: u.channel,
      autoHlabs: u.autoHlabs,
      autoApps: u.autoApps,
      backupBeforeUpdate: u.backupBeforeUpdate,
      lastCheckedAt: u.lastCheckedAt,
      available: latest,
    };
  }

  /** One check at a time; a second ask while one runs gets the same answer. */
  check(): Promise<UpdateStatus> {
    this.checking ??= this.run().finally(() => (this.checking = null));
    return this.checking;
  }

  /** Checks every 6 hours (the first one 6 hours after start; the tray checks 2 minutes after launch). */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.check().catch((err: unknown) => this.deps.logger.warn({ err }, 'update check failed'));
    }, CHECK_EVERY_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async run(): Promise<UpdateStatus> {
    const { db, bus, source, logger } = this.deps;
    try {
      this.deps.syncStore();
    } catch (err) {
      logger.warn({ err }, 'store sync failed');
    }
    const channel = getSetting(db, 'updates').channel;
    // Throws UPDATE_CHECK_FAILED when offline: nothing saved, the previous result stays.
    const release = await source.latest(channel);
    const newer = compareVersions(release.version, this.deps.version) > 0;
    const at = (this.deps.now ?? Date.now)();
    // For Advanced › "What hlabs connects to" (07 §7.1).
    setSetting(db, 'connections', { ...getSetting(db, 'connections'), updateCheck: { lastContactAt: at } });
    const u = getSetting(db, 'updates');
    const announce = newer && u.announced !== release.version;
    setSetting(db, 'updates', {
      ...u,
      lastCheckedAt: at,
      latest: newer ? { version: release.version, notes: noteBullets(release.notes), url: release.url } : null,
      announced: announce ? release.version : u.announced,
    });
    if (announce) bus.emit('update.available', { version: release.version, channel }, { kind: 'admins' });
    return this.status();
  }
}
