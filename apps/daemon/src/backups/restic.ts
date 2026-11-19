// restic, the backup engine (D-008, D-133): one encrypted repository per destination. The daemon drives the bundled
// binary through this interface; tests use a fake. Passwords and keys reach restic only through the child process's
// environment, never its command line or a log (07 §7.7). `--json` output drives progress.
import { hlabsError, type HlabsCode } from '@hlabs/api';
import { spawn } from 'node:child_process';

/** Where a repository is and what opens it. */
export interface Repo {
  /** restic's repository string: a folder, or `s3:https://…/bucket/hlabs-backups`. */
  url: string;
  /** RESTIC_PASSWORD and, for S3, AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY. */
  env: Record<string, string>;
}

export interface Snapshot {
  id: string;
  /** ms */
  time: number;
  tags: string[];
  paths: string[];
}

export interface Retention {
  daily: number;
  weekly: number;
  monthly: number;
}

export interface BackupResult {
  snapshotId: string;
  bytesAdded: number;
  filesChanged: number;
  /** Bytes in the backed-up folders. */
  totalBytes: number;
}

export interface ResticProgress {
  /** 0–1 */
  fraction: number;
  bytesDone: number;
  bytesTotal: number;
}

export interface Restic {
  /** `ok` when the repository is there and the password opens it, `missing` when there's none yet. */
  probe(repo: Repo, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<'ok' | 'missing'>;
  init(repo: Repo, opts?: { timeoutMs?: number }): Promise<void>;
  backup(
    repo: Repo,
    opts: { paths: string[]; tags: string[]; excludes?: string[]; signal?: AbortSignal },
    onProgress?: (p: ResticProgress) => void,
  ): Promise<BackupResult>;
  /** `forget --prune` with the plan's retention, each folder on its own (restic groups by host and paths). */
  forget(repo: Repo, retention: Retention, opts?: { signal?: AbortSignal }): Promise<void>;
  snapshots(repo: Repo, opts?: { tags?: string[] }): Promise<Snapshot[]>;
  /** Bytes the repository takes at the destination (`stats --mode raw-data`). */
  repoSize(repo: Repo): Promise<number>;
  /** Bytes a snapshot restores to (`stats --mode restore-size`). */
  restoreSize(repo: Repo, snapshotId: string): Promise<number>;
  /** Restores `path` of the snapshot (a folder it backed up) into `target`, as its contents. */
  restore(
    repo: Repo,
    opts: { snapshotId: string; path: string; target: string; signal?: AbortSignal },
    onProgress?: (p: ResticProgress) => void,
  ): Promise<void>;
  /** Removes stale locks (after a crash, US-BKP-05). */
  unlock(repo: Repo): Promise<void>;
}

/** What went wrong, from restic's exit code and what it printed (US-BKP-07). */
export function resticError(code: number | null, stderr: string): HlabsCode {
  if (code === 11) return 'BACKUP_REPO_LOCKED';
  if (code === 12 || /wrong password|no key found/i.test(stderr)) return 'BACKUP_REPO_PASSWORD_WRONG';
  if (/no space left|disk quota exceeded/i.test(stderr)) return 'BACKUP_DEST_FULL';
  if (
    /access ?denied|invalidaccesskeyid|signaturedoesnotmatch|403 forbidden|unauthorized|invalid credentials/i.test(
      stderr,
    )
  )
    return 'BACKUP_DEST_AUTH_FAILED';
  if (/repository is already locked/i.test(stderr)) return 'BACKUP_REPO_LOCKED';
  return 'BACKUP_DEST_UNREACHABLE';
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export class ResticCli implements Restic {
  constructor(
    private readonly bin: string,
    /** restic's cache, kept with hlabs's data (`<dataDir>/cache/restic`). */
    private readonly cacheDir: string,
  ) {}

  private run(
    repo: Repo,
    args: string[],
    opts: { timeoutMs?: number; signal?: AbortSignal; onLine?: (line: string) => void } = {},
  ): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      // Only what restic needs: never the daemon's own environment, which may hold other secrets.
      const env: Record<string, string> = {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        HOME: process.env.HOME ?? '/',
        RESTIC_REPOSITORY: repo.url,
        RESTIC_CACHE_DIR: this.cacheDir,
        ...repo.env,
      };
      const child = spawn(this.bin, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let partial = '';
      child.stdout.on('data', (d: Buffer) => {
        const text = d.toString('utf8');
        stdout += text;
        if (!opts.onLine) return;
        partial += text;
        const lines = partial.split('\n');
        partial = lines.pop() ?? '';
        for (const l of lines) if (l.trim()) opts.onLine(l);
      });
      child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')));
      let timedOut = false;
      const timer = opts.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
          }, opts.timeoutMs)
        : null;
      const abort = () => child.kill('SIGINT');
      opts.signal?.addEventListener('abort', abort, { once: true });
      child.on('error', (err) => {
        if (timer) clearTimeout(timer);
        reject(hlabsError('INTERNAL', `restic: ${err.message}`));
      });
      child.on('close', (code) => {
        if (timer) clearTimeout(timer);
        opts.signal?.removeEventListener('abort', abort);
        if (timedOut) return reject(hlabsError('BACKUP_DEST_UNREACHABLE', 'restic timed out'));
        if (opts.signal?.aborted) return reject(hlabsError('INTERNAL', 'Cancelled'));
        resolve({ code, stdout, stderr });
      });
    });
  }

  private async ok(repo: Repo, args: string[], opts: Parameters<ResticCli['run']>[2] = {}): Promise<RunResult> {
    const res = await this.run(repo, args, opts);
    if (res.code !== 0 && res.code !== 3) {
      throw hlabsError(resticError(res.code, res.stderr), lastLine(res.stderr));
    }
    return res;
  }

  async probe(repo: Repo, opts: { timeoutMs?: number; signal?: AbortSignal } = {}) {
    const res = await this.run(repo, ['cat', 'config', '--json'], opts);
    if (res.code === 0) return 'ok' as const;
    // 10: there's no repository here (restic ≥ 0.17).
    if (res.code === 10 || /repository does not exist|unable to open config file/i.test(res.stderr)) {
      return 'missing' as const;
    }
    throw hlabsError(resticError(res.code, res.stderr), lastLine(res.stderr));
  }

  async init(repo: Repo, opts: { timeoutMs?: number } = {}) {
    await this.ok(repo, ['init'], opts);
  }

  async backup(
    repo: Repo,
    opts: { paths: string[]; tags: string[]; excludes?: string[]; signal?: AbortSignal },
    onProgress?: (p: ResticProgress) => void,
  ): Promise<BackupResult> {
    const args = ['backup', '--json', '--host', 'hlabs', ...opts.tags.flatMap((t) => ['--tag', t])];
    for (const e of opts.excludes ?? []) args.push('--exclude', e);
    let summary: Record<string, unknown> | null = null;
    await this.ok(repo, [...args, ...opts.paths], {
      signal: opts.signal,
      onLine: (line) => {
        const msg = parseJson(line);
        if (msg?.message_type === 'status' && onProgress) {
          onProgress({
            fraction: Number(msg.percent_done ?? 0),
            bytesDone: Number(msg.bytes_done ?? 0),
            bytesTotal: Number(msg.total_bytes ?? 0),
          });
        }
        if (msg?.message_type === 'summary') summary = msg;
      },
    });
    const s = (summary ?? {}) as Record<string, unknown>;
    return {
      snapshotId: String(s.snapshot_id ?? ''),
      bytesAdded: Number(s.data_added ?? 0),
      filesChanged: Number(s.files_new ?? 0) + Number(s.files_changed ?? 0),
      totalBytes: Number(s.total_bytes_processed ?? 0),
    };
  }

  async forget(repo: Repo, r: Retention, opts: { signal?: AbortSignal } = {}) {
    await this.ok(
      repo,
      [
        'forget',
        '--prune',
        '--group-by',
        'host,paths',
        '--keep-daily',
        String(r.daily),
        '--keep-weekly',
        String(r.weekly),
        '--keep-monthly',
        String(r.monthly),
      ],
      opts,
    );
  }

  async snapshots(repo: Repo, opts: { tags?: string[] } = {}) {
    const tagArgs = (opts.tags ?? []).flatMap((t) => ['--tag', t]);
    const res = await this.ok(repo, ['snapshots', '--json', ...tagArgs]);
    const list = (parseJson(res.stdout) ?? []) as unknown as Array<{
      id: string;
      time: string;
      tags?: string[];
      paths?: string[];
    }>;
    return list.map((s) => ({ id: s.id, time: Date.parse(s.time), tags: s.tags ?? [], paths: s.paths ?? [] }));
  }

  async repoSize(repo: Repo) {
    const res = await this.ok(repo, ['stats', '--json', '--mode', 'raw-data']);
    return Number((parseJson(res.stdout) as { total_size?: number } | null)?.total_size ?? 0);
  }

  async restoreSize(repo: Repo, snapshotId: string) {
    const res = await this.ok(repo, ['stats', '--json', '--mode', 'restore-size', snapshotId]);
    return Number((parseJson(res.stdout) as { total_size?: number } | null)?.total_size ?? 0);
  }

  async restore(
    repo: Repo,
    opts: { snapshotId: string; path: string; target: string; signal?: AbortSignal },
    onProgress?: (p: ResticProgress) => void,
  ) {
    await this.ok(repo, ['restore', '--json', `${opts.snapshotId}:${opts.path}`, '--target', opts.target], {
      signal: opts.signal,
      onLine: (line) => {
        const msg = parseJson(line);
        if (msg?.message_type === 'status' && onProgress) {
          onProgress({
            fraction: Number(msg.percent_done ?? 0),
            bytesDone: Number(msg.bytes_restored ?? 0),
            bytesTotal: Number(msg.total_bytes ?? 0),
          });
        }
      },
    });
  }

  async unlock(repo: Repo) {
    await this.run(repo, ['unlock']);
  }
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const lastLine = (text: string) =>
  text
    .trim()
    .split('\n')
    .filter((l) => !/password|secret|key/i.test(l))
    .at(-1)
    ?.slice(0, 200) ?? 'restic failed';
