// The diagnostics bundle (US-SYS-28): a zip to attach to a bug report, built by the `diagnostics` job into
// `<dataDir>/diagnostics/<jobId>.zip` (0600), downloaded by the admin who asked through `GET /api/diagnostics/:jobId`
// within 15 minutes, then deleted. hlabs never sends it anywhere.
//
// It holds: system info, engine info, the apps with their states and versions, the daemon's, Caddy's and installs'
// logs of the last 7 days, the jobs of the last 7 days, and each app's container logs of the last 24 hours. Every
// file goes through one redactor first (bundleRedactor): the secret patterns, the values of secret env keys and of
// every app's `.env`, values hlabs keeps in the secret store, session ids and tokens, email addresses, IP addresses
// outside the home network, and people's names (usernames, display names, this computer's account) as user1, user2….
// No keychain item, database file or person's file is ever read into it.
import { apps, backupDestinations, jobs, storageLocations, users, type HlabsDb } from '@hlabs/db';
import { gte } from 'drizzle-orm';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { arch, cpus, release, totalmem, uptime, userInfo } from 'node:os';
import { join } from 'node:path';
import yazl from 'yazl';
import type { JobRunner } from '../jobs/runner';
import type { Logger } from '../logger';
import { PIHOLE_SECRET_REF } from '../network/dns';
import type { SecretStore } from '../platform/secrets';
import { rawLinesSince } from './logs';
import { bundleRedactor } from './redact';

export const DIAGNOSTICS_DIR = 'diagnostics';
/** How long a finished bundle can be downloaded before it's deleted. */
export const DOWNLOAD_FOR_MS = 15 * 60_000;
const DAY = 24 * 60 * 60_000;
/** The most lines of one app's containers in the bundle. */
const CONTAINER_LINES = 50_000;

export interface DiagnosticsDeps {
  db: HlabsDb;
  jobs: JobRunner;
  logger: Logger;
  secrets: SecretStore;
  dataDir: string;
  version: string;
  headless: boolean;
  hostname: () => string;
  engine: () => {
    kind: string | null;
    managedByHlabs: boolean;
    state: string;
    version: string | null;
  };
  /** An app's container logs since `since` (ms), oldest first; throws without an engine. */
  containerLogs: (appId: string, since: number) => Promise<Array<{ service: string; ts: number; line: string }>>;
  now?: () => number;
}

export interface BundleFile {
  name: string;
  text: string;
}

/** `hlabs-diagnostics-<hostname>-<YYYY-MM-DD>.zip`, in this computer's time. */
export function bundleName(hostname: string, at = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `hlabs-diagnostics-${hostname}-${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}.zip`;
}

/** `KEY=value` lines of an env file (quotes taken off). */
function envValues(text: string): Array<{ key: string; value: string }> {
  return text
    .split('\n')
    .map((line) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ key: m[1]!, value: m[2]!.replace(/^(['"])(.*)\1$/, '$2') }));
}

export class Diagnostics {
  /** Who asked for each bundle: only they may download it. */
  private readonly owners = new Map<string, string | null>();

  constructor(private readonly deps: DiagnosticsDeps) {}

  register(): void {
    this.deps.jobs.register<{ userId: string | null }>('diagnostics', {
      run: async ({ jobId, report }) => {
        const files = await this.collect((p) => report(Math.min(90, p)));
        await this.write(jobId, files);
        report(100);
        setTimeout(() => this.remove(jobId), DOWNLOAD_FOR_MS).unref();
      },
    });
    // Bundles a stopped daemon left behind are gone after it starts again.
    rmSync(join(this.deps.dataDir, DIAGNOSTICS_DIR), { recursive: true, force: true });
  }

  start(userId: string | null): string {
    const jobId = this.deps.jobs.start('diagnostics', { payload: { userId } });
    this.owners.set(jobId, userId);
    return jobId;
  }

  /** The bundle for a download: its path and name, or null (unknown, someone else's, not built, or expired). */
  file(jobId: string, userId: string | null): { path: string; name: string } | null {
    if (!/^[0-9A-Z]{26}$/.test(jobId)) return null;
    if (!this.owners.has(jobId) || this.owners.get(jobId) !== userId) return null;
    const job = this.deps.jobs.get(jobId);
    if (!job || job.kind !== 'diagnostics' || job.state !== 'succeeded' || job.finishedAt === null) return null;
    const now = (this.deps.now ?? Date.now)();
    const path = join(this.deps.dataDir, DIAGNOSTICS_DIR, `${jobId}.zip`);
    if (now - job.finishedAt > DOWNLOAD_FOR_MS || !existsSync(path)) return null;
    return { path, name: bundleName(this.deps.hostname(), new Date(job.createdAt)) };
  }

  private remove(jobId: string): void {
    this.owners.delete(jobId);
    rmSync(join(this.deps.dataDir, DIAGNOSTICS_DIR, `${jobId}.zip`), { force: true });
  }

  /** What to take out of every file: known secret values and people's names. */
  async redaction(): Promise<{ secrets: string[]; people: string[] }> {
    const { db, secrets: store, dataDir } = this.deps;
    const secrets: string[] = [];
    // Every app's .env but what hlabs itself puts there (HLABS_APP_ID, HLABS_URL…: names and addresses), when a
    // value is more than a number or a switch.
    for (const app of db.select({ id: apps.id }).from(apps).all()) {
      let text: string;
      try {
        text = readFileSync(join(dataDir, 'apps', app.id, '.env'), 'utf8');
      } catch {
        continue;
      }
      for (const { key, value } of envValues(text)) {
        if (key.startsWith('HLABS_')) continue;
        if (value.length >= 4 && !/^(?:\d+|true|false|yes|no)$/i.test(value)) secrets.push(value);
      }
    }
    // Values hlabs keeps in the secret store (read here only to remove them; never written to the bundle).
    const refs = new Set<string>([PIHOLE_SECRET_REF]);
    for (const d of db.select().from(backupDestinations).all()) {
      refs.add(d.repoPasswordRef);
      refs.add(`backup:${d.id}:s3-secret`);
    }
    for (const l of db.select({ ref: storageLocations.secretRef }).from(storageLocations).all()) {
      if (l.ref) refs.add(l.ref);
    }
    for (const ref of (await store.refs?.()) ?? []) refs.add(ref);
    for (const ref of refs) {
      const value = await store.get(ref).catch(() => null);
      if (value) secrets.push(value);
    }
    const people: string[] = [];
    for (const u of db.select({ username: users.username, displayName: users.displayName }).from(users).all()) {
      people.push(u.username, u.displayName);
    }
    try {
      people.push(userInfo().username);
    } catch {
      // No account name to hide.
    }
    return { secrets, people };
  }

  /** Every file of the bundle, already redacted. */
  async collect(progress: (p: number) => void = () => {}): Promise<BundleFile[]> {
    const { db, dataDir } = this.deps;
    const now = (this.deps.now ?? Date.now)();
    const redact = bundleRedactor(await this.redaction());
    const files: BundleFile[] = [];
    const add = (name: string, text: string) => files.push({ name, text: redact(text) });

    const cpu = cpus();
    add(
      'system.txt',
      [
        `hlabs ${this.deps.version}`,
        `Created: ${new Date(now).toISOString()}`,
        `OS: ${process.platform} ${release()} (${arch()})${this.deps.headless ? ', headless' : ''}`,
        `CPU: ${cpu[0]?.model.trim() ?? 'unknown'} · ${cpu.length} cores`,
        `Memory: ${Math.round(totalmem() / 1e9)} GB`,
        `Up for: ${Math.round(uptime() / 3600)} hours`,
        `Node: ${process.version}`,
        `Data folder: ${dataDir}`,
      ].join('\n'),
    );
    const engine = this.deps.engine();
    add(
      'engine.txt',
      [
        `Engine: ${engine.kind ?? 'none found'}${engine.managedByHlabs ? ' (installed by hlabs)' : ''}`,
        `State: ${engine.state}`,
        `Docker: ${engine.version ?? 'unknown'}`,
      ].join('\n'),
    );
    const appRows = db
      .select({
        id: apps.id,
        version: apps.version,
        previousVersion: apps.previousVersion,
        state: apps.state,
        stateDetail: apps.stateDetail,
        autostart: apps.autostart,
        custom: apps.custom,
        installedAt: apps.installedAt,
        updatedAt: apps.updatedAt,
      })
      .from(apps)
      .all();
    add('apps.json', JSON.stringify(appRows, null, 2));
    progress(10);

    const weekAgo = now - 7 * DAY;
    add('logs/hlabsd.log', rawLinesSince(dataDir, 'daemon', weekAgo).join('\n'));
    add('logs/caddy.log', rawLinesSince(dataDir, 'proxy', weekAgo).join('\n'));
    add('logs/installs.log', rawLinesSince(dataDir, 'installs', weekAgo).join('\n'));
    // The jobs, without their payloads (which can carry settings).
    const jobRows = db
      .select({
        id: jobs.id,
        kind: jobs.kind,
        target: jobs.target,
        state: jobs.state,
        progress: jobs.progress,
        message: jobs.message,
        errorCode: jobs.errorCode,
        createdAt: jobs.createdAt,
        finishedAt: jobs.finishedAt,
      })
      .from(jobs)
      .where(gte(jobs.createdAt, weekAgo))
      .all();
    add('logs/jobs.json', JSON.stringify(jobRows, null, 2));
    progress(30);

    const dayAgo = now - DAY;
    for (const [i, app] of appRows.entries()) {
      try {
        const lines = (await this.deps.containerLogs(app.id, dayAgo)).slice(-CONTAINER_LINES);
        add(
          `containers/${app.id}.log`,
          lines.map((l) => `${l.service} ${new Date(l.ts).toISOString()} ${l.line}`).join('\n'),
        );
      } catch (err) {
        add(`containers/${app.id}.log`, `Couldn't read the logs: ${(err as Error).message}`);
      }
      progress(30 + Math.round(((i + 1) / appRows.length) * 60));
    }
    return files;
  }

  private async write(jobId: string, files: BundleFile[]): Promise<void> {
    const dir = join(this.deps.dataDir, DIAGNOSTICS_DIR);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const zip = new yazl.ZipFile();
    for (const f of files) zip.addBuffer(Buffer.from(f.text, 'utf8'), f.name, { mtime: new Date() });
    zip.end();
    const path = join(dir, `${jobId}.zip`);
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(path, { mode: 0o600 });
      out.on('close', () => resolve());
      out.on('error', reject);
      zip.outputStream.on('error', reject).pipe(out);
    });
  }
}

/** Old bundles left in the folder (tests). */
export function bundlesIn(dataDir: string): string[] {
  const dir = join(dataDir, DIAGNOSTICS_DIR);
  return existsSync(dir) ? readdirSync(dir).filter((n) => statSync(join(dir, n)).isFile()) : [];
}
