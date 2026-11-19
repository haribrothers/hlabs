// Backup destinations (US-BKP-08…11, D-132): cloud storage (S3-compatible), a network drive (a connected SMB/NFS
// location, or a share typed in the dialog, connected with "Let apps use this drive" off) and an external drive. Each
// holds one restic repository in `hlabs-backups`, encrypted with its own password, which lives in the secret store
// with the S3 secret key (07 §7.7). Adding checks reachability, credentials and writing within 20 s, then makes the
// repository, or opens the one already there with its password.
import { hlabsError, type HlabsCode } from '@hlabs/api';
import { auditLog, backupDestinations, backupRuns, storageLocations, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { rootLocation } from '../apps/folders';
import type { JobRunner } from '../jobs/runner';
import type { Logger } from '../logger';
import type { DriveProbe } from '../platform/drives';
import type { SecretStore } from '../platform/secrets';
import type { NetworkDrives } from '../storage/drives';
import type { NetworkStorage } from '../storage/network';
import type { Repo, Restic } from './restic';

export const REPO_FOLDER = 'hlabs-backups';
/** Test and add answer within this (US-BKP-09). */
export const TEST_MS = 20_000;
/** Destinations are checked this often (US-BKP-02, D-133). */
export const HEALTH_MS = 6 * 60 * 60 * 1000;

type Row = typeof backupDestinations.$inferSelect;

export type DestinationTarget =
  | { type: 'cloud'; endpoint: string; bucket: string; accessKey: string; secretKey: string }
  | {
      type: 'network';
      locationId?: string;
      address?: { protocol: 'smb' | 'nfs'; host: string; share: string };
      username?: string;
      password?: string;
    }
  | { type: 'external'; drivePath: string; folder?: string };

export interface DestinationInput {
  name: string;
  target: DestinationTarget;
  repoPassword: string;
}

/** What `config_json` holds: never a password or key (those are in the secret store). */
type Config =
  | { type: 'cloud'; endpoint: string; bucket: string; accessKey: string }
  | { type: 'network'; locationId: string; folder: string }
  | { type: 'external'; drivePath: string; driveName: string; folder: string };

export interface DestinationsDeps {
  db: HlabsDb;
  secrets: SecretStore;
  restic: Restic;
  network: NetworkStorage;
  networkDrives: NetworkDrives;
  drives: DriveProbe;
  jobs: JobRunner;
  logger: Logger;
  dataDir: string;
  /** Asks again for the admin's password (07 §7.8). */
  confirmPassword: (userId: string, password: string, action: string, ip: string) => Promise<void>;
}

const passwordRef = (id: string) => `backup:${id}:password`;
const s3Ref = (id: string) => `backup:${id}:s3-secret`;

const s3Url = (c: { endpoint: string; bucket: string }) =>
  `s3:${c.endpoint.replace(/\/+$/, '')}/${c.bucket}/${REPO_FOLDER}`;

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

/** "NAS · Backups": the host without its domain and the share's last folder, as Files names drives. */
function shareName(address: { host: string; share: string }): string {
  const host = address.host.replace(/\.(local|home\.arpa|lan)$/i, '');
  const last = address.share.split('/').filter(Boolean).at(-1) ?? address.share;
  return `${host.charAt(0).toUpperCase()}${host.slice(1)} · ${last.charAt(0).toUpperCase()}${last.slice(1)}`;
}

/** The disk a folder is on (tests on one disk replace it). */
async function deviceOf(path: string): Promise<number | null> {
  return (await stat(path).catch(() => null))?.dev ?? null;
}

async function writable(dir: string): Promise<boolean> {
  const probe = join(dir, `.hlabs-backup-test-${ulid()}`);
  try {
    await writeFile(probe, 'ok');
    await rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(hlabsError('BACKUP_DEST_UNREACHABLE', 'No answer in time')), ms).unref(),
    ),
  ]);
}

export class Destinations {
  private timer: NodeJS.Timeout | null = null;
  /** Which disk a folder is on, for "Pick a different disk" (replaceable in tests, whose folders share one disk). */
  deviceOf = deviceOf;

  constructor(private readonly deps: DestinationsDeps) {}

  rows(): Row[] {
    return this.deps.db.select().from(backupDestinations).all();
  }

  get(id: string): Row {
    const row = this.deps.db.select().from(backupDestinations).where(eq(backupDestinations.id, id)).get();
    if (!row) throw hlabsError('NOT_FOUND', 'No such destination');
    return row;
  }

  private config(row: Row): Config {
    return row.configJson as unknown as Config;
  }

  /** The repository's place, without secrets (for duplicates). */
  private urlOf(config: Config): string | null {
    if (config.type === 'cloud') return s3Url(config);
    if (config.type === 'external') return join(config.drivePath, config.folder);
    const loc = this.location(config.locationId);
    return loc ? join(loc.path, config.folder) : null;
  }

  private location(id: string) {
    return this.deps.db.select().from(storageLocations).where(eq(storageLocations.id, id)).get() ?? null;
  }

  /** Where it is, for people (US-BKP-02). */
  label(row: Row): string {
    const c = this.config(row);
    if (c.type === 'cloud') return `${hostOf(c.endpoint)}/${c.bucket}`;
    if (c.type === 'external') return c.driveName;
    const loc = this.location(c.locationId);
    const opts = JSON.parse(loc?.mountOptions ?? '{}') as { host?: string; share?: string };
    return opts.host ? `${opts.host}/${(opts.share ?? '').replace(/^\/+/, '')}` : (loc?.name ?? 'Network drive');
  }

  /** The repository to use, with its password and keys; BACKUP_DEST_UNREACHABLE when its drive isn't there. */
  async repo(row: Row): Promise<Repo> {
    const c = this.config(row);
    const password = await this.deps.secrets.get(row.repoPasswordRef);
    if (!password) throw hlabsError('AUTH_SECRET_UNAVAILABLE', 'The encryption password is missing');
    if (c.type === 'cloud') {
      const secret = (await this.deps.secrets.get(s3Ref(row.id))) ?? '';
      return {
        url: s3Url(c),
        env: { RESTIC_PASSWORD: password, AWS_ACCESS_KEY_ID: c.accessKey, AWS_SECRET_ACCESS_KEY: secret },
      };
    }
    if (c.type === 'external') {
      if (!existsSync(c.drivePath)) throw hlabsError('BACKUP_DEST_UNREACHABLE', `${c.driveName} isn't connected`);
      return { url: join(c.drivePath, c.folder), env: { RESTIC_PASSWORD: password } };
    }
    const loc = this.location(c.locationId);
    if (!loc || loc.status !== 'ok')
      throw hlabsError('BACKUP_DEST_UNREACHABLE', `${loc?.name ?? 'The drive'} is offline`);
    return { url: join(loc.path, c.folder), env: { RESTIC_PASSWORD: password } };
  }

  /**
   * A destination before it's saved: its config, the repository, and where it would be on disk (to check writing).
   * A share typed in the dialog is tested by mounting it somewhere temporary (`connect: false`) or connected for good.
   */
  private async resolve(
    input: DestinationInput,
    connect: boolean,
    opts: { userId: string | null; ip: string | null },
  ): Promise<{ config: Config; repo: Repo; kind: Row['kind']; folder: string | null; connected: string | null }> {
    const t = input.target;
    const env = { RESTIC_PASSWORD: input.repoPassword };
    if (t.type === 'cloud') {
      const config: Config = {
        type: 'cloud',
        endpoint: t.endpoint.replace(/\/+$/, ''),
        bucket: t.bucket,
        accessKey: t.accessKey,
      };
      return {
        config,
        repo: {
          url: s3Url(config),
          env: { ...env, AWS_ACCESS_KEY_ID: t.accessKey, AWS_SECRET_ACCESS_KEY: t.secretKey },
        },
        kind: 's3',
        folder: null,
        connected: null,
      };
    }
    if (t.type === 'external') {
      const drive = (await this.deps.drives.externalDrives()).find((d) => d.path === t.drivePath);
      if (!drive) throw hlabsError('BACKUP_DEST_UNREACHABLE', "That drive isn't connected");
      if (!drive.writable) throw hlabsError('FILES_READ_ONLY', "hlabs can't write to that drive");
      const folder = t.folder ?? REPO_FOLDER;
      const config: Config = { type: 'external', drivePath: drive.path, driveName: drive.name, folder };
      return {
        config,
        repo: { url: join(drive.path, folder), env },
        kind: 'local',
        folder: drive.path,
        connected: null,
      };
    }
    let locationId = t.locationId ?? null;
    let connected: string | null = null;
    if (!locationId) {
      if (!t.address) throw hlabsError('VALIDATION_FAILED', 'Choose a drive or enter a share address');
      const share = { ...t.address, username: t.username, password: t.password };
      if (!connect) {
        // Reachable, credentials right, writable: as Connect a drive tests it (US-FILE-11).
        await withTimeout(this.deps.network.test(share), TEST_MS);
        return {
          config: { type: 'network', locationId: '', folder: REPO_FOLDER },
          repo: { url: '', env },
          kind: t.address.protocol,
          folder: null,
          connected: null,
        };
      }
      locationId = await this.deps.network.add(
        { ...share, name: shareName(t.address), appsAllowed: false, autoMount: true },
        opts,
      );
      connected = locationId;
    }
    const loc = this.location(locationId);
    if (!loc || loc.isRoot || (loc.kind !== 'smb' && loc.kind !== 'nfs'))
      throw hlabsError('NOT_FOUND', 'No such drive');
    if (loc.status !== 'ok')
      throw hlabsError('BACKUP_DEST_UNREACHABLE', `${loc.name} is offline`, { location: loc.name });
    const config: Config = { type: 'network', locationId: loc.id, folder: REPO_FOLDER };
    return { config, repo: { url: join(loc.path, REPO_FOLDER), env }, kind: loc.kind, folder: loc.path, connected };
  }

  /** Not on the disk hlabs keeps its data on, not a repository already in use, writable (US-BKP-09). */
  private async check(config: Config, folder: string | null, exceptId?: string) {
    const url = this.urlOf(config);
    if (url && this.rows().some((r) => r.id !== exceptId && this.urlOf(this.config(r)) === url)) {
      throw hlabsError('BACKUP_DEST_DUPLICATE');
    }
    if (folder && config.type === 'external') {
      const root = rootLocation(this.deps.db);
      const dev = await this.deviceOf(folder);
      const others = await Promise.all([this.deviceOf(this.deps.dataDir), root ? this.deviceOf(root.path) : null]);
      if (dev !== null && others.includes(dev)) {
        throw hlabsError('VALIDATION_FAILED', 'Pick a different disk', { reason: 'sameDisk' });
      }
    }
    if (folder && !(await writable(folder))) throw hlabsError('FILES_READ_ONLY', "hlabs can't write there");
  }

  /** `existing`: backups are there and the password opens them; a wrong password is BACKUP_REPO_PASSWORD_WRONG. */
  private async probe(repo: Repo): Promise<boolean> {
    try {
      return (await withTimeout(this.deps.restic.probe(repo, { timeoutMs: TEST_MS }), TEST_MS)) === 'ok';
    } catch (err) {
      const code = (err as { cause?: { hlabsCode?: HlabsCode } }).cause?.hlabsCode;
      if (code === 'BACKUP_REPO_PASSWORD_WRONG') throw hlabsError(code, undefined, { existing: true });
      throw err;
    }
  }

  /** "Test connection" (US-BKP-09). */
  async test(input: DestinationInput): Promise<{ existing: boolean }> {
    const r = await this.resolve(input, false, { userId: null, ip: null });
    if (!r.repo.url) return { existing: false };
    await this.check(r.config, r.folder);
    return { existing: await this.probe(r.repo) };
  }

  /** "Add destination" (US-BKP-09, US-BKP-10): tested again, the repository made or opened, then saved. */
  async add(input: DestinationInput, opts: { userId: string | null; ip: string | null; now?: number }) {
    const r = await this.resolve(input, true, opts);
    try {
      await this.check(r.config, r.folder);
      const existing = await this.probe(r.repo);
      if (!existing) await withTimeout(this.deps.restic.init(r.repo, { timeoutMs: TEST_MS }), TEST_MS);
    } catch (err) {
      // A share connected just for this goes again.
      if (r.connected) await this.deps.networkDrives.remove(r.connected, opts).catch(() => {});
      throw err;
    }
    const id = ulid();
    await this.deps.secrets.set(passwordRef(id), input.repoPassword);
    if (input.target.type === 'cloud') await this.deps.secrets.set(s3Ref(id), input.target.secretKey);
    const now = opts.now ?? Date.now();
    this.deps.db.transaction((tx) => {
      tx.insert(backupDestinations)
        .values({
          id,
          kind: r.kind,
          name: input.name,
          configJson: r.config as unknown as Record<string, unknown>,
          repoPasswordRef: passwordRef(id),
          status: 'ok',
          createdAt: now,
        })
        .run();
      tx.insert(auditLog)
        .values({
          id: ulid(),
          at: now,
          userId: opts.userId,
          action: 'backup.destination.add',
          target: id,
          detailJson: { name: input.name, kind: r.kind },
          ip: opts.ip,
        })
        .run();
    });
    void this.refresh(id).catch(() => {});
    return { destinationId: id };
  }

  /** Name, and for cloud storage its keys, tested before saving (US-BKP-11). */
  async update(
    id: string,
    input: { name?: string; accessKey?: string; secretKey?: string },
    opts: { userId: string | null; ip: string | null },
  ) {
    const row = this.get(id);
    const c = this.config(row);
    let config = c;
    if ((input.accessKey || input.secretKey) && c.type === 'cloud') {
      const repo = await this.repo(row);
      const accessKey = input.accessKey ?? c.accessKey;
      const secret = input.secretKey ?? repo.env.AWS_SECRET_ACCESS_KEY ?? '';
      const tryRepo = { ...repo, env: { ...repo.env, AWS_ACCESS_KEY_ID: accessKey, AWS_SECRET_ACCESS_KEY: secret } };
      if (!(await this.probe(tryRepo))) throw hlabsError('BACKUP_DEST_UNREACHABLE', 'No backups there any more');
      if (input.secretKey) await this.deps.secrets.set(s3Ref(id), input.secretKey);
      config = { ...c, accessKey };
    }
    this.deps.db.transaction((tx) => {
      tx.update(backupDestinations)
        .set({ name: input.name ?? row.name, configJson: config as unknown as Record<string, unknown>, status: 'ok' })
        .where(eq(backupDestinations.id, id))
        .run();
      tx.insert(auditLog)
        .values({
          id: ulid(),
          at: Date.now(),
          userId: opts.userId,
          action: 'backup.destination.update',
          target: id,
          detailJson: { name: input.name ?? row.name, keys: !!(input.accessKey || input.secretKey) },
          ip: opts.ip,
        })
        .run();
    });
  }

  /** A backup to it is running. */
  busy(id: string): boolean {
    return (
      this.deps.db
        .select({ id: backupRuns.id })
        .from(backupRuns)
        .where(and(eq(backupRuns.destinationId, id), eq(backupRuns.status, 'running')))
        .all().length > 0
    );
  }

  /** Stop backing up there; nothing at the destination is deleted and its runs stay in history (US-BKP-11). */
  async remove(id: string, opts: { userId: string | null; ip: string | null }) {
    const row = this.get(id);
    if (this.busy(id))
      throw hlabsError('JOB_EXCLUSIVE_RUNNING', 'A backup to it is running', { runningKind: 'backup' });
    this.deps.db.transaction((tx) => {
      tx.delete(backupDestinations).where(eq(backupDestinations.id, id)).run();
      tx.insert(auditLog)
        .values({
          id: ulid(),
          at: Date.now(),
          userId: opts.userId,
          action: 'backup.destination.remove',
          target: id,
          detailJson: { name: row.name, kind: row.kind },
          ip: opts.ip,
        })
        .run();
    });
    await this.deps.secrets.delete(row.repoPasswordRef).catch(() => {});
    await this.deps.secrets.delete(s3Ref(id)).catch(() => {});
  }

  /** "Show encryption password" after the admin's password (US-BKP-10, 07 §7.7). */
  async exportPassword(id: string, opts: { userId: string; password: string; ip: string }) {
    const row = this.get(id);
    await this.deps.confirmPassword(opts.userId, opts.password, 'backup.password.export', opts.ip);
    const repoPassword = await this.deps.secrets.get(row.repoPasswordRef);
    if (!repoPassword) throw hlabsError('AUTH_SECRET_UNAVAILABLE');
    this.deps.db
      .insert(auditLog)
      .values({
        id: ulid(),
        at: Date.now(),
        userId: opts.userId,
        action: 'backup.password.export',
        target: id,
        detailJson: { name: row.name },
        ip: opts.ip,
      })
      .run();
    return { repoPassword };
  }

  setStatus(id: string, status: 'ok' | 'unreachable' | 'attention') {
    this.deps.db.update(backupDestinations).set({ status }).where(eq(backupDestinations.id, id)).run();
  }

  /** Space used and restore points (one per run, the `run:` tags). */
  async refresh(id: string) {
    const row = this.get(id);
    const repo = await this.repo(row);
    const [usedBytes, snaps] = await Promise.all([this.deps.restic.repoSize(repo), this.deps.restic.snapshots(repo)]);
    const runs = new Set(snaps.flatMap((s) => s.tags.filter((t) => t.startsWith('run:'))));
    this.deps.db
      .update(backupDestinations)
      .set({ usedBytes, snapshotCount: runs.size })
      .where(eq(backupDestinations.id, id))
      .run();
  }

  /** Every 6 hours: reachable or not (US-BKP-02). A destination needing attention stays so until a run tidies up. */
  async checkAll() {
    for (const row of this.rows()) {
      try {
        await withTimeout(this.deps.restic.probe(await this.repo(row), { timeoutMs: TEST_MS }), TEST_MS);
        if (row.status === 'unreachable') this.setStatus(row.id, 'ok');
      } catch (err) {
        this.deps.logger.info({ destination: row.id, err: (err as Error).message }, 'backup destination unreachable');
        this.setStatus(row.id, 'unreachable');
      }
    }
  }

  /** When the newest successful run to it started: its latest restore point (US-BKP-17). */
  latestAt(id: string): number | null {
    return (
      this.deps.db
        .select({ at: backupRuns.startedAt })
        .from(backupRuns)
        .where(and(eq(backupRuns.destinationId, id), eq(backupRuns.status, 'succeeded')))
        .orderBy(desc(backupRuns.startedAt))
        .get()?.at ?? null
    );
  }

  /** The last time a run to it ended, for the list. */
  lastRunAt(id: string): number | null {
    return (
      this.deps.db
        .select({ at: backupRuns.finishedAt })
        .from(backupRuns)
        .where(and(eq(backupRuns.destinationId, id), isNotNull(backupRuns.finishedAt)))
        .orderBy(desc(backupRuns.finishedAt))
        .get()?.at ?? null
    );
  }

  /** The list, as Backups shows it (US-BKP-02). */
  list() {
    return this.rows().map((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      location: this.label(row),
      status: (['ok', 'unreachable', 'attention'].includes(row.status) ? row.status : 'ok') as
        'ok' | 'unreachable' | 'attention',
      usedBytes: row.usedBytes ?? null,
      restorePoints: row.snapshotCount ?? null,
      offsite: row.kind === 's3' || row.kind === 'sftp' || row.kind === 'hlabs',
      hasKeys: row.kind === 's3',
      busy: this.busy(row.id),
      latestAt: this.latestAt(row.id),
    }));
  }

  start(intervalMs = HEALTH_MS) {
    this.timer = setInterval(() => void this.checkAll(), intervalMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

/** Made the first time it's needed (restic's cache). */
export async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}
