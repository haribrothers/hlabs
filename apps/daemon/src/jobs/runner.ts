// Long work runs as jobs: persisted in `jobs`, reported with job.progress / job.finished (02 §2.2).
import { EXCLUSIVE_JOB_KINDS, hlabsCodeOf, hlabsError, type HlabsCode, type Job, type JobKind } from '@hlabs/api';
import { jobs, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { EventBus } from '../events/bus';
import type { Logger } from '../logger';

export interface JobContext<P> {
  jobId: string;
  target: string | null;
  payload: P;
  signal: AbortSignal;
  /** Progress 0–100 with an optional short message. */
  report(progress: number, message?: string): void;
}

export interface JobDefinition<P = unknown> {
  run(ctx: JobContext<P>): Promise<void>;
  /** Whether jobs.cancel may abort it (default false). */
  cancellable?: boolean;
}

const ACTIVE = ['queued', 'running'] as const;
const EXCLUSIVE = new Set<string>(EXCLUSIVE_JOB_KINDS);

export class JobRunner {
  private readonly definitions = new Map<JobKind, JobDefinition<never>>();
  private readonly running = new Map<string, { controller: AbortController; done: Promise<void> }>();

  constructor(
    private readonly db: HlabsDb,
    private readonly bus: EventBus,
    private readonly logger: Logger,
  ) {}

  register<P>(kind: JobKind, definition: JobDefinition<P>): void {
    this.definitions.set(kind, definition as JobDefinition<never>);
  }

  /** After a crash: jobs that were queued or running can't resume in phase 0, so fail them cleanly. */
  recover(): number {
    const result = this.db
      .update(jobs)
      .set({ state: 'failed', errorCode: 'INTERNAL', message: 'Interrupted by a restart', finishedAt: Date.now() })
      .where(inArray(jobs.state, [...ACTIVE]))
      .run();
    if (result.changes > 0) this.logger.warn({ count: result.changes }, 'marked interrupted jobs as failed');
    return result.changes;
  }

  /** Queue a job and start it. Throws JOB_EXCLUSIVE_RUNNING when D-020 forbids it. */
  start<P>(kind: JobKind, options: { target?: string | null; payload?: P } = {}): string {
    const definition = this.definitions.get(kind);
    if (!definition) throw hlabsError('NOT_IMPLEMENTED', `No job handler for ${kind}`);
    const id = ulid();
    const target = options.target ?? null;

    this.db.transaction((tx) => {
      const active = tx
        .select({ kind: jobs.kind })
        .from(jobs)
        .where(inArray(jobs.state, [...ACTIVE]))
        .all();
      const exclusiveActive = active.some((j) => EXCLUSIVE.has(j.kind));
      if (exclusiveActive || (EXCLUSIVE.has(kind) && active.length > 0)) {
        throw hlabsError('JOB_EXCLUSIVE_RUNNING');
      }
      tx.insert(jobs)
        .values({
          id,
          kind,
          target,
          state: 'queued',
          progress: 0,
          payloadJson: options.payload ?? null,
          createdAt: Date.now(),
        })
        .run();
    });

    const controller = new AbortController();
    const done = this.execute(id, kind, target, options.payload as never, definition, controller);
    this.running.set(id, { controller, done });
    void done.finally(() => this.running.delete(id));
    return id;
  }

  get(id: string): Job | null {
    const row = this.db.select().from(jobs).where(eq(jobs.id, id)).get();
    return row ? toJob(row) : null;
  }

  /** The most recent job of a kind, in any state. */
  latest(kind: JobKind): Job | null {
    const row = this.db.select().from(jobs).where(eq(jobs.kind, kind)).orderBy(desc(jobs.createdAt)).get();
    return row ? toJob(row) : null;
  }

  listActive(): Job[] {
    return this.db
      .select()
      .from(jobs)
      .where(inArray(jobs.state, [...ACTIVE]))
      .orderBy(desc(jobs.createdAt))
      .all()
      .map(toJob);
  }

  cancel(id: string): void {
    const job = this.get(id);
    if (!job) throw hlabsError('NOT_FOUND');
    const definition = this.definitions.get(job.kind);
    const live = this.running.get(id);
    if (!live || !definition?.cancellable) throw hlabsError('JOB_NOT_CANCELLABLE');
    live.controller.abort();
  }

  /** Resolves when the job has finished (tests and shutdown). */
  async settled(id: string): Promise<Job | null> {
    await this.running.get(id)?.done;
    return this.get(id);
  }

  async shutdown(): Promise<void> {
    for (const { controller } of this.running.values()) controller.abort();
    await Promise.allSettled([...this.running.values()].map((r) => r.done));
  }

  private async execute(
    id: string,
    kind: JobKind,
    target: string | null,
    payload: never,
    definition: JobDefinition<never>,
    controller: AbortController,
  ): Promise<void> {
    await Promise.resolve();
    this.db.update(jobs).set({ state: 'running' }).where(eq(jobs.id, id)).run();
    let lastProgress = -1;
    const report = (progress: number, message?: string) => {
      const p = Math.max(0, Math.min(100, Math.round(progress)));
      if (p === lastProgress && message === undefined) return;
      lastProgress = p;
      this.db
        .update(jobs)
        .set({ progress: p, message: message ?? null })
        .where(and(eq(jobs.id, id), eq(jobs.state, 'running')))
        .run();
      this.bus.emit('job.progress', { jobId: id, kind, target, progress: p, message: message ?? null });
    };

    let state: 'succeeded' | 'failed' | 'cancelled' = 'succeeded';
    let errorCode: HlabsCode | null = null;
    try {
      // Cancelled before it started: don't run it at all.
      if (!controller.signal.aborted) {
        await definition.run({ jobId: id, target, payload, signal: controller.signal, report });
      }
      if (controller.signal.aborted) state = 'cancelled';
    } catch (error) {
      if (controller.signal.aborted) {
        state = 'cancelled';
      } else {
        state = 'failed';
        errorCode = hlabsCodeOf(error);
        this.logger.error({ err: error, jobId: id, kind }, 'job failed');
      }
    }
    this.db
      .update(jobs)
      .set({
        state,
        errorCode,
        progress: state === 'succeeded' ? 100 : Math.max(lastProgress, 0),
        finishedAt: Date.now(),
      })
      .where(eq(jobs.id, id))
      .run();
    this.bus.emit('job.finished', { jobId: id, kind, target, state, hlabsCode: errorCode });
  }
}

function toJob(row: typeof jobs.$inferSelect): Job {
  return {
    id: row.id,
    kind: row.kind as JobKind,
    target: row.target,
    state: row.state,
    progress: row.progress,
    message: row.message,
    hlabsCode: (row.errorCode as HlabsCode | null) ?? null,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
  };
}
