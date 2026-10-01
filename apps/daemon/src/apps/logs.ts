// An app's logs across its containers (US-APP-08…10): the latest lines, oldest first, and following new ones. The
// daemon reads Docker's logs only while someone asks; a container that restarts while followed is picked up again
// and marked with a "restarted" line.
import { hlabsError, type LogLine } from '@hlabs/api';
import type { EngineService } from '../engine/service';
import type { ContainerEngine, ContainerState } from '../engine/types';

/** How often to look for a stopped container coming back. */
const REATTACH_MS = 1_000;

export interface AppLogsDeps {
  engine: Pick<EngineService, 'client'>;
  /** The app's compose project name. */
  project: (appId: string) => string;
  reattachMs?: number;
}

export class AppLogs {
  constructor(private readonly deps: AppLogsDeps) {}

  /** The last `tail` lines across the app's containers (or one service's), oldest first. */
  async recent(appId: string, opts: { service?: string; tail: number; since?: number }): Promise<LogLine[]> {
    const engine = this.engine();
    const containers = await this.containers(engine, appId, opts.service);
    const lines = await Promise.all(
      containers.map(async (c) => {
        const out: LogLine[] = [];
        for await (const l of engine.containerLogs(c.id, { tail: opts.tail, since: opts.since })) {
          out.push({ service: c.service, ...l });
        }
        return out;
      }),
    );
    return lines
      .flat()
      .sort((a, b) => a.ts - b.ts)
      .slice(-opts.tail);
  }

  /** New lines as they come, after `since` (ms) when given, until `signal` aborts. */
  async *watch(
    appId: string,
    opts: { service?: string; since?: number },
    signal?: AbortSignal,
  ): AsyncGenerator<LogLine> {
    const engine = this.engine();
    const services = [...new Set((await this.containers(engine, appId, opts.service)).map((c) => c.service))];
    // Its own stop, so the followers end too when the reader stops early.
    const stop = new AbortController();
    const abort = () => stop.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort);
    const queue: LogLine[] = [];
    let wake: (() => void) | null = null;
    const push = (line: LogLine) => {
      queue.push(line);
      wake?.();
    };
    const onAbort = () => wake?.();
    stop.signal.addEventListener('abort', onAbort);
    const followers = services.map((service) => this.follow(engine, appId, service, opts.since, push, stop.signal));
    try {
      while (!stop.signal.aborted) {
        while (queue.length) yield queue.shift()!;
        await new Promise<void>((r) => (wake = r));
        wake = null;
      }
    } finally {
      signal?.removeEventListener('abort', abort);
      stop.abort();
      await Promise.allSettled(followers);
    }
  }

  /** One service's lines, reattached each time its container comes back. */
  private async follow(
    engine: ContainerEngine,
    appId: string,
    service: string,
    since: number | undefined,
    push: (line: LogLine) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    let last = since;
    let lastLine: string | null = null;
    let attached: Pick<ContainerState, 'id' | 'startedAt'> | null = null;
    while (!signal?.aborted) {
      const container = (await this.containers(engine, appId, service).catch(() => [])).find(
        (c) => c.state === 'running',
      );
      if (!container) {
        await sleep(this.deps.reattachMs ?? REATTACH_MS, signal);
        continue;
      }
      // A new container, or the same one started again.
      if (attached && (attached.id !== container.id || attached.startedAt !== container.startedAt)) {
        push({ service, stream: 'stdout', ts: Date.now(), line: '', restarted: true });
      }
      attached = { id: container.id, startedAt: container.startedAt };
      try {
        // From where it left off; only new lines the first time without a `since`.
        const opts = last === undefined ? { tail: 0 } : { since: last };
        for await (const l of engine.containerLogs(container.id, { ...opts, follow: true, signal })) {
          // `since` includes its own moment: skip what came before, and the last line again.
          if (last !== undefined && (l.ts < last || (l.ts === last && l.line === lastLine))) continue;
          last = l.ts;
          lastLine = l.line;
          push({ service, ...l });
        }
      } catch {
        // The container went away mid-stream; look for it again.
      }
      last ??= Date.now();
      await sleep(this.deps.reattachMs ?? REATTACH_MS, signal);
    }
  }

  private engine(): ContainerEngine {
    const engine = this.deps.engine.client;
    if (!engine) throw hlabsError('ENGINE_UNAVAILABLE');
    return engine;
  }

  private async containers(engine: ContainerEngine, appId: string, service?: string): Promise<ContainerState[]> {
    const all = await engine.projectContainers(this.deps.project(appId));
    return service ? all.filter((c) => c.service === service) : all;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done);
  });
}
