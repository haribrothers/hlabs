import { hlabsError, type HlabsCode } from '@hlabs/api';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { BackupResult, Repo, Restic, ResticProgress, Retention, Snapshot } from '../../src/backups/restic';
import { tempDir } from '../helpers';

type Op = 'probe' | 'init' | 'backup' | 'forget' | 'snapshots' | 'restore' | 'repoSize' | 'restoreSize' | 'unlock';

interface FakeSnapshot extends Snapshot {
  dir: string;
  bytes: number;
}

interface FakeRepo {
  password: string;
  snapshots: FakeSnapshot[];
}

function sizeOf(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) n += statSync(join(e.parentPath, e.name)).size;
  }
  return n;
}

/**
 * restic in memory, with real copies of what it backs up (so restores put real files back). Repositories are keyed by
 * their URL; `fail` makes an operation throw a backup error (each time, or `once`); `gate` holds backups and restores
 * until it resolves (to cancel one midway); `unreachable` makes every operation on a URL fail as a sleeping NAS would.
 */
export class FakeRestic implements Restic {
  readonly repos = new Map<string, FakeRepo>();
  readonly store = tempDir('fake-restic-');
  readonly calls: Array<{ op: Op; url: string; detail?: unknown }> = [];
  readonly fail = new Map<Op, { code: HlabsCode; times: number }>();
  readonly unreachable = new Set<string>();
  gate: Promise<void> | null = null;
  /** Called as a backup or restore reaches the gate. */
  onGate: (() => void) | null = null;
  private seq = 0;

  failNext(op: Op, code: HlabsCode, times = 1) {
    this.fail.set(op, { code, times });
  }

  private enter(op: Op, repo: Repo, detail?: unknown) {
    this.calls.push({ op, url: repo.url, detail });
    if (this.unreachable.has(repo.url)) throw hlabsError('BACKUP_DEST_UNREACHABLE', 'host did not respond');
    const f = this.fail.get(op);
    if (f) {
      if (--f.times <= 0) this.fail.delete(op);
      throw hlabsError(f.code, `fake ${op} failed`);
    }
  }

  private open(repo: Repo): FakeRepo {
    const r = this.repos.get(repo.url);
    if (!r) throw hlabsError('BACKUP_DEST_UNREACHABLE', 'repository does not exist');
    if (r.password !== repo.env.RESTIC_PASSWORD) throw hlabsError('BACKUP_REPO_PASSWORD_WRONG');
    return r;
  }

  private async wait(signal?: AbortSignal) {
    if (!this.gate) return;
    this.onGate?.();
    await Promise.race([
      this.gate,
      new Promise<void>((_, reject) =>
        signal?.addEventListener('abort', () => reject(hlabsError('INTERNAL', 'Cancelled'))),
      ),
    ]);
  }

  /** A repository already at a destination (made elsewhere). */
  seed(url: string, password: string) {
    this.repos.set(url, { password, snapshots: [] });
  }

  async probe(repo: Repo) {
    this.enter('probe', repo);
    if (!this.repos.has(repo.url)) return 'missing' as const;
    this.open(repo);
    return 'ok' as const;
  }

  async init(repo: Repo) {
    this.enter('init', repo);
    if (this.repos.has(repo.url)) throw hlabsError('INTERNAL', 'config file already exists');
    this.repos.set(repo.url, { password: repo.env.RESTIC_PASSWORD ?? '', snapshots: [] });
  }

  async backup(
    repo: Repo,
    opts: { paths: string[]; tags: string[]; excludes?: string[]; signal?: AbortSignal },
    onProgress?: (p: ResticProgress) => void,
  ): Promise<BackupResult> {
    this.enter('backup', repo, { paths: opts.paths, tags: opts.tags, excludes: opts.excludes ?? [] });
    const r = this.open(repo);
    onProgress?.({ fraction: 0.5, bytesDone: 1, bytesTotal: 2 });
    await this.wait(opts.signal);
    const id = `snap${String(++this.seq).padStart(4, '0')}`;
    const dir = join(this.store, id);
    for (const path of opts.paths) {
      if (!existsSync(path)) continue;
      cpSync(path, join(dir, encodeURIComponent(path)), {
        recursive: true,
        filter: (src) => {
          const rel = relative(path, src);
          return !(opts.excludes ?? []).some(
            (e) => rel === e.replace(/\/$/, '') || rel.startsWith(e.endsWith('/') ? e : `${e}/`),
          );
        },
      });
    }
    const bytes = sizeOf(dir);
    r.snapshots.push({ id, time: Date.now(), tags: opts.tags, paths: opts.paths, dir, bytes });
    onProgress?.({ fraction: 1, bytesDone: bytes, bytesTotal: bytes });
    return { snapshotId: id, bytesAdded: bytes, filesChanged: 1, totalBytes: bytes };
  }

  async forget(repo: Repo, retention: Retention) {
    this.enter('forget', repo, retention);
    const r = this.open(repo);
    // Keep the newest `daily` per folder, as a stand-in for restic's policy.
    const byPaths = new Map<string, FakeSnapshot[]>();
    for (const s of r.snapshots) byPaths.set(s.paths.join('\n'), [...(byPaths.get(s.paths.join('\n')) ?? []), s]);
    const keep = new Set<string>();
    for (const list of byPaths.values()) {
      for (const s of [...list].sort((a, b) => b.time - a.time).slice(0, Math.max(1, retention.daily))) keep.add(s.id);
    }
    for (const s of r.snapshots) if (!keep.has(s.id)) rmSync(s.dir, { recursive: true, force: true });
    r.snapshots = r.snapshots.filter((s) => keep.has(s.id));
  }

  async snapshots(repo: Repo, opts: { tags?: string[] } = {}) {
    this.enter('snapshots', repo);
    return this.open(repo)
      .snapshots.filter((s) => (opts.tags ?? []).every((t) => s.tags.includes(t)))
      .map(({ id, time, tags, paths, bytes }) => ({ id, time, tags, paths, bytes }));
  }

  async repoSize(repo: Repo) {
    this.enter('repoSize', repo);
    return this.open(repo).snapshots.reduce((n, s) => n + s.bytes, 0);
  }

  async restoreSize(repo: Repo, snapshotId: string) {
    this.enter('restoreSize', repo);
    return this.open(repo).snapshots.find((s) => s.id === snapshotId)?.bytes ?? 0;
  }

  async restore(
    repo: Repo,
    opts: { snapshotId: string; path: string; target: string; signal?: AbortSignal },
    onProgress?: (p: ResticProgress) => void,
  ) {
    this.enter('restore', repo, opts);
    const snap = this.open(repo).snapshots.find((s) => s.id === opts.snapshotId);
    if (!snap) throw hlabsError('NOT_FOUND', 'no such snapshot');
    onProgress?.({ fraction: 0.5, bytesDone: Math.round(snap.bytes / 2), bytesTotal: snap.bytes });
    await this.wait(opts.signal);
    mkdirSync(opts.target, { recursive: true });
    const from = join(snap.dir, encodeURIComponent(opts.path));
    if (existsSync(from)) cpSync(from, opts.target, { recursive: true });
    onProgress?.({ fraction: 1, bytesDone: snap.bytes, bytesTotal: snap.bytes });
  }

  async unlock(repo: Repo) {
    this.calls.push({ op: 'unlock', url: repo.url });
  }
}
