// Factory reset (US-SYS-37, US-SYS-38, 07 §7.8, D-170). `system.factoryReset` checks the person (an admin signed in
// with a session), the hostname typed exactly and their password (a wrong one counts towards the lockout); then the
// exclusive `factory_reset` job starts, the reset is audited (in `audit_log` and in `<dataDir>/logs/factory-reset.log`,
// which outlives the database), every session ends at once and /healthz says `resetting` with its step.
//
// The job only ever touches this instance's own things: its apps' compose projects (`<prefix>-<appId>`, D-090, taken
// down with their volumes), its app data folder, Shared, the trash and (unless kept) Home folders under its storage
// root, its compose projects folder, Tailscale Serve entries and DNS records hlabs made, its mDNS names, network drives
// it mounted, and the secret-store items hlabs created (never the tray's token). Backup repositories are left alone.
// A step that fails is noted and the job carries on. Last it leaves the next onboarding's setup token in the secret
// store and a marker, and hlabsd starts again (exit 75): the start sees the marker, deletes the database before
// opening it, and so begins with an empty one, in onboarding (`completeFactoryReset`).
import { CLOUDFLARE_CREDENTIAL } from '../public/service';
import { hlabsError } from '@hlabs/api';
import {
  apps,
  auditLog,
  backupDestinations,
  getSetting,
  invites,
  setSetting,
  storageLocations,
  userTotp,
  users,
  type HlabsDb,
} from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, normalize, sep } from 'node:path';
import type { DownOptions } from '../apps/compose';
import { TRAY_TOKEN_ACCOUNT } from '../auth/tray-token';
import type { EventBus } from '../events/bus';
import { widgetKeyRef } from '../home/app-widgets';
import type { JobRunner } from '../jobs/runner';
import type { Logger } from '../logger';
import { PIHOLE_SECRET_REF } from '../network/dns';
import { SETUP_TOKEN_REF } from '../onboarding/service';
import type { SecretStore } from '../platform/secrets';
import type { Readiness } from '../readiness';
import { LIBRARY_KEY_REF } from '../store/library-keys';

/** Written last by the job; its presence makes the next start begin with an empty database. */
export const RESET_MARKER = 'factory-reset.json';
/** The reset's audit entries, kept outside the database the reset deletes. */
export const RESET_LOG = ['logs', 'factory-reset.log'];
/** The notification the next admin finds when something couldn't be deleted. */
export const RESET_INCOMPLETE_KIND = 'system.factory_reset_incomplete';

interface Marker {
  at: number;
  keepHomeFolders: boolean;
  /** What couldn't be deleted, for people. */
  left: string[];
}

export interface FactoryResetDeps {
  db: HlabsDb;
  jobs: JobRunner;
  bus: EventBus;
  logger: Logger;
  readiness: Readiness;
  secrets: SecretStore;
  dataDir: string;
  appDataDir: string;
  /** The storage root's folder (Home folders, Shared, the trash). */
  storageRoot: () => string;
  /** Stops everything that runs on a timer or follows the engine (app watch, backups, updates…), so nothing brings
   * an app back or writes while the reset deletes. */
  quiesce: () => void;
  sessions: { revokeWhere(match: () => boolean): string[] };
  confirmPassword: (userId: string, password: string, ip: string) => Promise<void>;
  apps: { composeDown(appId: string, options?: DownOptions): Promise<void> };
  /** Deletes an app's data folder, as root from one of its images when needed (Linux). */
  removeAppData: (appId: string, folder: string) => Promise<void>;
  /** Tailscale Serve entries hlabs made (remote access off). */
  disconnectRemote: (userId: string) => Promise<void>;
  /** Records hlabs wrote in a local DNS server. */
  clearDns: (userId: string) => Promise<void>;
  unpublishNames: () => Promise<void>;
  unmountDrives: () => Promise<void>;
  /** Stops and exits 75 (tests pass a fake). */
  restart: () => void;
  exitDelayMs?: number;
}

export interface ResetInput {
  password: string;
  confirmHostname: string;
  keepHomeFolders: boolean;
}

export interface ResetCaller {
  userId: string;
  role: 'admin' | 'member';
  /** Only a real signed-in session (not the development-only anonymous admin, not the tray). */
  hasSession: boolean;
  ip: string;
}

/** Folders the reset may delete: absolute, under a folder it was given, and never a home or a top-level folder. */
export function safeToDelete(path: string, within: readonly string[]): boolean {
  if (!isAbsolute(path)) return false;
  const p = normalize(path);
  const depth = p.split(sep).filter(Boolean).length;
  if (depth < 2 || p === normalize(homedir())) return false;
  return within.some((w) => {
    const base = normalize(w);
    return p === base || p.startsWith(`${base}${sep}`);
  });
}

export class FactoryReset {
  /** The next onboarding's setup token, held in memory between the call and the job's end (never in SQLite). */
  private setupToken: string | null = null;

  constructor(private readonly deps: FactoryResetDeps) {}

  register(): void {
    this.deps.jobs.register<{ keepHomeFolders: boolean; userId: string }>('factory_reset', {
      run: async ({ payload, report }) => {
        const marker = await this.wipe(payload.keepHomeFolders, payload.userId, (step, pct) => {
          this.deps.readiness.resetting(step);
          report(pct);
        });
        this.deps.readiness.resetting(3);
        report(100);
        writeFileSync(join(this.deps.dataDir, RESET_MARKER), JSON.stringify(marker), { mode: 0o600 });
        setTimeout(() => this.deps.restart(), this.deps.exitDelayMs ?? 300).unref();
      },
    });
  }

  /** US-SYS-37: checks, then the job; returns its id and the next onboarding's setup token. */
  async start(input: ResetInput, caller: ResetCaller): Promise<{ jobId: string; setupToken: string }> {
    const { db } = this.deps;
    // A member, a session from before a role change, or no session at all (US-SYS-37's "member or stale session").
    if (caller.role !== 'admin' || !caller.hasSession) throw hlabsError('ACCESS_DENIED');
    const user = db.select().from(users).where(eq(users.id, caller.userId)).get();
    if (!user || user.role !== 'admin' || user.disabledAt !== null) throw hlabsError('ACCESS_DENIED');
    if (input.confirmHostname !== getSetting(db, 'hostname')) {
      throw hlabsError('VALIDATION_FAILED', 'The typed name is not the hostname', { field: 'confirmHostname' });
    }
    await this.deps.confirmPassword(user.id, input.password, caller.ip);
    // Refused (JOB_EXCLUSIVE_RUNNING) while any other job runs; nothing has changed yet then.
    this.deps.jobs.assertCanStart('factory_reset');
    const setupToken = randomBytes(32).toString('base64url');
    this.setupToken = setupToken;
    const entry = {
      id: ulid(),
      at: Date.now(),
      userId: user.id,
      action: 'system.factory_reset',
      target: null,
      detailJson: { keepHomeFolders: input.keepHomeFolders, username: user.username },
      ip: caller.ip,
    };
    // Audited before anything is deleted: in the table, and in a file that outlives it.
    db.insert(auditLog).values(entry).run();
    this.appendLog(entry);
    const jobId = this.deps.jobs.start('factory_reset', {
      payload: { keepHomeFolders: input.keepHomeFolders, userId: user.id },
    });
    this.deps.sessions.revokeWhere(() => true);
    this.deps.readiness.resetting(0);
    this.deps.bus.emit('system.status', { state: 'resetting' });
    return { jobId, setupToken };
  }

  private appendLog(entry: Record<string, unknown>): void {
    const path = join(this.deps.dataDir, ...RESET_LOG);
    try {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    } catch (err) {
      this.deps.logger.warn({ err }, "couldn't write the factory reset log");
    }
  }

  /** Deletes everything it can; returns what's left (US-SYS-38: a failure never stops it). */
  private async wipe(
    keepHomeFolders: boolean,
    userId: string,
    step: (step: number, progress: number) => void,
  ): Promise<Marker> {
    const { deps } = this;
    const { db, logger } = deps;
    const left: string[] = [];
    const attempt = async (what: string, fn: () => unknown) => {
      try {
        await fn();
      } catch (err) {
        logger.warn({ err, what }, 'factory reset: left behind');
        left.push(what);
      }
    };

    step(0, 5);
    deps.quiesce();
    // Read before anything goes: the refs of what hlabs keeps in the secret store.
    const appIds = db
      .select({ id: apps.id })
      .from(apps)
      .all()
      .map((a) => a.id);
    const refs = await this.secretRefs(appIds);
    const root = deps.storageRoot();

    // 1. Every app's containers, networks and volumes (this instance's projects only).
    for (const [i, appId] of appIds.entries()) {
      await attempt(`app ${appId}`, () => deps.apps.composeDown(appId, { removeVolumes: true }));
      step(0, 5 + Math.round(((i + 1) / Math.max(appIds.length, 1)) * 35));
    }

    // 2. Data: each app's folder (as root if it must), then app-data, Shared, the trash and Home folders.
    step(1, 45);
    for (const appId of appIds) {
      await attempt(`app data of ${appId}`, () => deps.removeAppData(appId, join(deps.appDataDir, appId)));
    }
    const folders = [
      deps.appDataDir,
      join(root, 'shared'),
      join(root, '.trash'),
      ...(keepHomeFolders ? [] : [join(root, 'users')]),
      join(deps.dataDir, 'apps'),
      join(deps.dataDir, 'wallpapers'),
      join(deps.dataDir, 'diagnostics'),
      join(deps.dataDir, 'cache'),
    ];
    for (const folder of folders) {
      if (!safeToDelete(folder, [deps.dataDir, deps.appDataDir, root])) {
        left.push(folder);
        continue;
      }
      await attempt(folder, () => rmSync(folder, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }));
    }

    // 3. What hlabs set up outside its folders, then its secrets.
    step(2, 75);
    await attempt('Tailscale Serve', () => deps.disconnectRemote(userId));
    await attempt('local DNS records', () => deps.clearDns(userId));
    await attempt('network names', () => deps.unpublishNames());
    await attempt('network drives', () => deps.unmountDrives());
    for (const ref of refs) await attempt(`secret ${ref}`, () => deps.secrets.delete(ref));
    // The token the browser that asked was given: the onboarding that follows reuses it (D-013).
    if (this.setupToken) await attempt('setup token', () => deps.secrets.set(SETUP_TOKEN_REF, this.setupToken!));
    this.setupToken = null;
    step(2, 95);

    if (left.length) this.appendLog({ at: Date.now(), action: 'system.factory_reset.left', left });
    return { at: Date.now(), keepHomeFolders, left };
  }

  /** Every secret-store item hlabs made, from the database (and the encrypted file's own list), never the tray's. */
  private async secretRefs(appIds: string[]): Promise<string[]> {
    const { db } = this.deps;
    const refs = new Set<string>([PIHOLE_SECRET_REF, LIBRARY_KEY_REF, SETUP_TOKEN_REF, CLOUDFLARE_CREDENTIAL]);
    for (const appId of appIds) refs.add(widgetKeyRef(appId));
    for (const t of db.select({ ref: userTotp.secretRef }).from(userTotp).all()) refs.add(t.ref);
    for (const i of db.select({ ref: invites.tokenRef }).from(invites).all()) if (i.ref) refs.add(i.ref);
    for (const u of db.select({ ref: users.sharePasswordRef }).from(users).all()) if (u.ref) refs.add(u.ref);
    for (const l of db.select({ ref: storageLocations.secretRef }).from(storageLocations).all()) {
      if (l.ref) refs.add(l.ref);
    }
    for (const d of db.select().from(backupDestinations).all()) {
      refs.add(d.repoPasswordRef);
      refs.add(`backup:${d.id}:s3-secret`);
    }
    // The encrypted file holds only this instance's items; the keychain is never listed (D-170).
    for (const ref of (await this.deps.secrets.refs?.()) ?? []) refs.add(ref);
    refs.delete(TRAY_TOKEN_ACCOUNT);
    return [...refs];
  }
}

/**
 * At start, before the database is opened: after a factory reset, delete it so this start makes an empty one.
 * Returns the marker (null without one); `finishFactoryReset` completes it once the new database is open.
 */
export function takeFactoryResetMarker(dataDir: string, logger: Logger): Marker | null {
  const path = join(dataDir, RESET_MARKER);
  if (!existsSync(path)) return null;
  let marker: Marker;
  try {
    marker = JSON.parse(readFileSync(path, 'utf8')) as Marker;
  } catch {
    marker = { at: Date.now(), keepHomeFolders: false, left: [] };
  }
  const db = join(dataDir, 'hlabs.db');
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${db}${suffix}`, { force: true });
  rmSync(path, { force: true });
  logger.info('factory reset: starting with an empty database');
  return marker;
}

/** On the new database: onboarding reuses the setup token the reset left, and what was left is said once. */
export async function finishFactoryReset(
  db: HlabsDb,
  secrets: SecretStore,
  marker: Marker,
  notify: (n: { title: string; body: string }) => void,
): Promise<void> {
  if (await secrets.get(SETUP_TOKEN_REF).catch(() => null)) {
    setSetting(db, 'onboarding', { ...getSetting(db, 'onboarding'), setupTokenRef: SETUP_TOKEN_REF });
  }
  if (marker.left.length) {
    notify({
      title: "The factory reset couldn't delete everything",
      body: `Left behind: ${marker.left.join(', ')}.`.slice(0, 300),
    });
  }
}
