// Uploads in the dashboard (US-FILE-08…10): one file at a time in the order chosen, 8 MB chunks at the offset the server
// has. Pause stops after the chunk being sent; a chunk that fails for want of a connection is tried again after 1, 2,
// 4, 8 and 16 s, then the upload pauses ("Paused · connection lost"); Resume asks the server where it got to. A name
// that's taken asks Skip / Keep both / Replace (or uses the choice made "for every conflict"). When everything has
// finished, the panel waits 5 s and becomes a toast. The transport is injected so the logic is tested without HTTP.
import { csrfHeaders } from '../lib/csrf';

export const CHUNK_BYTES = 8 * 1024 * 1024;
export const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000];
export const COLLAPSE_AFTER_MS = 5_000;
/** The estimate uses how much went in the last 10 s (US-FILE-08). */
export const RATE_WINDOW_MS = 10_000;

export type OnConflict = 'skip' | 'keepBoth' | 'replace';

export type RowStatus =
  | 'waiting'
  | 'uploading'
  | 'done'
  | 'skipped'
  | 'connectionLost'
  | 'noSpace'
  | 'readOnly'
  | 'elsewhere'
  | 'failed'
  | 'cancelled';

export interface UploadRow {
  key: number;
  file: File;
  /** The folder it goes to (virtual path) and its name for people ("Documents"). */
  folder: string;
  folderName: string;
  name: string;
  size: number;
  sent: number;
  status: RowStatus;
  id: string | null;
  /** Its name in the folder when it finished (Keep both may change it). */
  savedAs: string | null;
}

/** An answer from the upload routes that isn't a success: its status and hlabsCode. */
export class UploadHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: Record<string, unknown> | null,
  ) {
    super(code);
  }
}

export interface UploadTransport {
  /** Whether a file or folder of that path exists (files.stat). */
  exists(path: string): Promise<boolean>;
  create(body: {
    path: string;
    name: string;
    size: number;
    onConflict: OnConflict;
  }): Promise<{ id: string; offset: number }>;
  chunk(id: string, offset: number, bytes: Blob, signal: AbortSignal): Promise<{ offset: number; done: unknown }>;
  offset(id: string): Promise<number>;
  cancel(id: string): Promise<void>;
}

export interface ConflictAnswer {
  choice: OnConflict;
  /** "Do this for every conflict": the rest of this batch isn't asked. */
  all: boolean;
}

export interface UploadManagerOptions {
  /** Ask about a name that's taken (US-FILE-10). */
  askConflict: (row: UploadRow) => Promise<ConflictAnswer>;
  /** A file landed (the folder's listing is fetched again). */
  onFileDone?: (row: UploadRow) => void;
  /** Everything finished: the panel collapses into "<n> files uploaded" (US-FILE-08). */
  onAllDone?: (uploaded: number) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}

const FINISHED: RowStatus[] = ['done', 'skipped', 'noSpace', 'readOnly', 'elsewhere', 'failed', 'cancelled'];
export const isFinished = (r: UploadRow) => FINISHED.includes(r.status);

/** A network failure (no answer) rather than an answer saying no. */
const isNetwork = (err: unknown) => !(err instanceof UploadHttpError) && (err as Error)?.name !== 'AbortError';

export interface UploadSnapshot {
  rows: UploadRow[];
  paused: boolean;
  /** Seconds left at the recent rate; null until there's a rate. */
  secondsLeft: number | null;
}

export class UploadManager {
  private rows: UploadRow[] = [];
  private paused = false;
  private running = false;
  private nextKey = 1;
  private rule: OnConflict | null = null;
  private abort: AbortController | null = null;
  private collapse: unknown = null;
  private samples: Array<{ at: number; sent: number }> = [];
  private snapshot: UploadSnapshot = { rows: [], paused: false, secondsLeft: null };
  private readonly listeners = new Set<() => void>();
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (t: unknown) => void;

  constructor(
    private readonly transport: UploadTransport,
    private readonly opts: UploadManagerOptions,
  ) {
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snapshot;

  private publish() {
    this.snapshot = { rows: this.rows.map((r) => ({ ...r })), paused: this.paused, secondsLeft: this.secondsLeft() };
    for (const l of this.listeners) l();
  }

  private totalSent() {
    return this.rows.reduce((n, r) => n + r.sent, 0);
  }

  private secondsLeft(): number | null {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (!first || !last || last.at - first.at < 1_000) return null;
    const rate = (last.sent - first.sent) / ((last.at - first.at) / 1000);
    if (rate <= 0) return null;
    const left = this.rows
      .filter((r) => r.status === 'waiting' || r.status === 'uploading')
      .reduce((n, r) => n + (r.size - r.sent), 0);
    return Math.round(left / rate);
  }

  private sample() {
    const at = this.now();
    this.samples.push({ at, sent: this.totalSent() });
    this.samples = this.samples.filter((s) => at - s.at <= RATE_WINDOW_MS);
  }

  /** Files picked or dropped, in that order, into `folder`. */
  add(files: File[], folder: string, folderName: string) {
    if (this.collapse !== null) {
      this.clearTimer(this.collapse);
      this.collapse = null;
    }
    // A new batch: the "for every conflict" choice was for the last one.
    if (this.rows.every(isFinished)) {
      this.rows = [];
      this.rule = null;
      this.samples = [];
    }
    for (const file of files) {
      this.rows.push({
        key: this.nextKey++,
        file,
        folder,
        folderName,
        name: file.name,
        size: file.size,
        sent: 0,
        status: 'waiting',
        id: null,
        savedAs: null,
      });
    }
    this.publish();
    void this.run();
  }

  pause() {
    this.paused = true;
    this.publish();
  }

  resume() {
    this.paused = false;
    for (const r of this.rows) if (r.status === 'connectionLost') r.status = 'waiting';
    this.publish();
    void this.run();
  }

  /** Every unfinished upload is removed on the server (session and partial file); finished files are kept. */
  async cancelAll() {
    this.abort?.abort();
    const open = this.rows.filter((r) => !isFinished(r));
    for (const r of open) r.status = 'cancelled';
    this.publish();
    await Promise.all(open.filter((r) => r.id).map((r) => this.transport.cancel(r.id!).catch(() => {})));
    this.rows = [];
    this.paused = false;
    this.publish();
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      while (!this.paused) {
        const row = this.rows.find((r) => r.status === 'waiting' || r.status === 'uploading');
        if (!row) break;
        await this.upload(row);
      }
    } finally {
      this.running = false;
    }
    this.maybeCollapse();
  }

  private maybeCollapse() {
    if (!this.rows.length || !this.rows.every(isFinished) || this.collapse !== null) return;
    this.collapse = this.setTimer(() => {
      this.collapse = null;
      if (!this.rows.every(isFinished)) return;
      const uploaded = this.rows.filter((r) => r.status === 'done').length;
      this.rows = [];
      this.publish();
      this.opts.onAllDone?.(uploaded);
    }, COLLAPSE_AFTER_MS);
  }

  private async upload(row: UploadRow) {
    try {
      if (!row.id) {
        let onConflict: OnConflict = 'keepBoth';
        if (await this.transport.exists(`${row.folder}/${row.name}`)) {
          const answer = this.rule ? { choice: this.rule, all: true } : await this.opts.askConflict(row);
          if (answer.all) this.rule = answer.choice;
          if (answer.choice === 'skip') {
            row.status = 'skipped';
            this.publish();
            return;
          }
          onConflict = answer.choice;
        }
        const made = await this.transport.create({ path: row.folder, name: row.name, size: row.size, onConflict });
        row.id = made.id;
        row.sent = made.offset;
      } else {
        row.sent = await this.transport.offset(row.id);
      }
      row.status = 'uploading';
      this.publish();
      for (;;) {
        if (this.paused) return;
        const end = Math.min(row.sent + CHUNK_BYTES, row.size);
        const result = await this.sendChunk(row, end);
        if (result === 'stop') return;
        row.sent = result.offset;
        this.sample();
        if (result.done) {
          const done = result.done as { name?: string; skipped?: boolean };
          row.status = done.skipped ? 'skipped' : 'done';
          row.savedAs = done.name ?? null;
          this.publish();
          if (row.status === 'done') this.opts.onFileDone?.(row);
          return;
        }
        this.publish();
      }
    } catch (err) {
      if (row.status === 'cancelled') return;
      row.status = this.failure(err);
      this.publish();
    }
  }

  /** One chunk, tried again after 1, 2, 4, 8 and 16 s while there's no connection. */
  private async sendChunk(row: UploadRow, end: number): Promise<{ offset: number; done: unknown } | 'stop'> {
    for (let attempt = 0; ; attempt++) {
      this.abort = new AbortController();
      try {
        return await this.transport.chunk(row.id!, row.sent, row.file.slice(row.sent, end), this.abort.signal);
      } catch (err) {
        if (row.status === 'cancelled') return 'stop';
        if (err instanceof UploadHttpError && err.code === 'UPLOAD_OFFSET_MISMATCH') {
          // The server has a different amount: carry on from there.
          row.sent = Number(err.detail?.offset ?? 0);
          return { offset: row.sent, done: null };
        }
        if (!isNetwork(err)) throw err;
        if (attempt >= RETRY_DELAYS_MS.length) {
          row.status = 'connectionLost';
          this.paused = true;
          this.publish();
          return 'stop';
        }
        await this.sleep(RETRY_DELAYS_MS[attempt]!);
        // Pause or Cancel all may have come while waiting.
        if (this.paused || (row.status as RowStatus) === 'cancelled') return 'stop';
        // Where the server got to, in case part of the chunk arrived.
        row.sent = await this.transport.offset(row.id!).catch(() => row.sent);
        end = Math.min(row.sent + CHUNK_BYTES, row.size);
      }
    }
  }

  private failure(err: unknown): RowStatus {
    if (!(err instanceof UploadHttpError)) return isNetwork(err) ? 'connectionLost' : 'failed';
    if (err.code === 'FILES_NO_SPACE') return 'noSpace';
    if (err.code === 'FILES_READ_ONLY' || err.code === 'FILES_ACCESS_DENIED') return 'readOnly';
    if (err.code === 'UPLOAD_IN_PROGRESS') return 'elsewhere';
    return 'failed';
  }
}

async function failed(res: Response): Promise<never> {
  const body = (await res.json().catch(() => null)) as { hlabsCode?: string; detail?: Record<string, unknown> } | null;
  throw new UploadHttpError(res.status, body?.hlabsCode ?? 'INTERNAL', body?.detail ?? null);
}

/** The daemon's /api/files/upload routes, with the session's CSRF header. */
export function httpTransport(exists: (path: string) => Promise<boolean>): UploadTransport {
  return {
    exists,
    async create(body) {
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify(body),
      });
      return res.ok ? ((await res.json()) as { id: string; offset: number }) : failed(res);
    },
    async chunk(id, offset, bytes, signal) {
      const res = await fetch(`/api/files/upload/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/offset+octet-stream',
          'upload-offset': String(offset),
          ...csrfHeaders(),
        },
        body: bytes,
        signal,
      });
      return res.ok ? ((await res.json()) as { offset: number; done: unknown }) : failed(res);
    },
    async offset(id) {
      const res = await fetch(`/api/files/upload/${encodeURIComponent(id)}`, {
        method: 'HEAD',
        credentials: 'same-origin',
      });
      if (!res.ok) await failed(res);
      return Number(res.headers.get('upload-offset') ?? 0);
    },
    async cancel(id) {
      await fetch(`/api/files/upload/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: csrfHeaders(),
      });
    },
  };
}
