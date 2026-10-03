import { EventEmitter } from 'node:events';
import type { ContainerLogLine } from '../../src/engine/log-frames';
import type {
  ContainerEngine,
  ContainerState,
  ContainerStats,
  EngineCandidate,
  EngineInfo,
  PullProgress,
} from '../../src/engine/types';

/** In-memory container engine (11-testing-release: only e2e touches real Docker). A FakeCompose shares it, so
 * compose up/down shows up here as containers. */
export class FakeEngine implements ContainerEngine {
  readonly images = new Set<string>();
  readonly networks = new Set<string>();
  /** Compose project → its containers. */
  readonly containers = new Map<string, ContainerState[]>();
  /** Images pulled, in order. */
  readonly pulls: string[] = [];
  /** Bytes each pull reports (default 100 in two steps). */
  readonly pullSizes = new Map<string, number>();
  /** Pulls that fail. */
  readonly pullErrors = new Map<string, Error>();
  /** While set, pulls wait for it (to see a second install queue behind the first). */
  pullGate: Promise<void> | null = null;

  constructor(
    public running = true,
    public engineInfo: EngineInfo = { version: '27.0.0-fake', cpus: 4, memoryBytes: 8e9 },
  ) {}

  async ping() {
    return this.running;
  }

  async info() {
    this.assertRunning();
    return this.engineInfo;
  }

  async ensureNetwork(name: string) {
    this.assertRunning();
    this.networks.add(name);
  }

  async hasImage(ref: string) {
    this.assertRunning();
    return this.images.has(ref);
  }

  async pullImage(ref: string, onProgress: (p: PullProgress) => void, signal?: AbortSignal) {
    this.assertRunning();
    this.pulls.push(ref);
    if (this.pullGate) await this.pullGate;
    const error = this.pullErrors.get(ref);
    if (error) throw error;
    const total = this.pullSizes.get(ref) ?? 100;
    onProgress({ current: Math.floor(total / 2), total });
    if (signal?.aborted) throw new Error('aborted');
    onProgress({ current: total, total });
    this.images.add(ref);
  }

  /** Container id → its stats (a quiet container otherwise); `slowStats` makes a call hang, `statsErrors` fail. */
  readonly stats = new Map<string, ContainerStats>();
  readonly slowStats = new Set<string>();
  readonly statsErrors = new Set<string>();
  statsCalls = 0;

  async containerStats(containerId: string, signal?: AbortSignal): Promise<ContainerStats> {
    this.assertRunning();
    this.statsCalls++;
    if (this.statsErrors.has(containerId)) throw new Error(`no stats for ${containerId}`);
    if (this.slowStats.has(containerId)) {
      await new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    }
    return (
      this.stats.get(containerId) ?? {
        cpuPercent: 0,
        memBytes: 0,
        netRxBytes: 0,
        netTxBytes: 0,
        diskReadBytes: 0,
        diskWriteBytes: 0,
      }
    );
  }

  async projectContainers(project: string) {
    this.assertRunning();
    return structuredClone(this.containers.get(project) ?? []);
  }

  /** Container id → its log lines; `addLog` appends one (and followers see it), `endLogs` ends followers. */
  readonly logLines = new Map<string, ContainerLogLine[]>();
  private readonly logEvents = new EventEmitter();

  addLog(containerId: string, line: ContainerLogLine) {
    const lines = this.logLines.get(containerId) ?? [];
    lines.push(line);
    this.logLines.set(containerId, lines);
    this.logEvents.emit(`line:${containerId}`, line);
  }

  /** How many streams follow a container's logs right now. */
  following(containerId: string): number {
    return this.logEvents.listenerCount(`line:${containerId}`);
  }

  /** How many times its logs have been followed so far. */
  readonly followCount = new Map<string, number>();

  /** The container stopped: its followed log streams end. */
  endLogs(containerId: string) {
    this.logEvents.emit(`end:${containerId}`);
  }

  async *containerLogs(
    containerId: string,
    opts: { tail?: number; since?: number; until?: number; follow?: boolean; signal?: AbortSignal },
  ): AsyncGenerator<ContainerLogLine> {
    this.assertRunning();
    let lines = (this.logLines.get(containerId) ?? []).filter(
      (l) => (opts.since === undefined || l.ts > opts.since) && (opts.until === undefined || l.ts <= opts.until),
    );
    if (opts.until !== undefined) {
      yield* lines;
      return;
    }
    if (opts.tail !== undefined) lines = opts.tail === 0 ? [] : lines.slice(-opts.tail);
    if (!opts.follow) {
      yield* lines;
      return;
    }
    this.followCount.set(containerId, (this.followCount.get(containerId) ?? 0) + 1);
    const queue = [...lines];
    let ended = false;
    let wake: (() => void) | null = null;
    const onLine = (line: ContainerLogLine) => (queue.push(line), wake?.());
    const onEnd = () => ((ended = true), wake?.());
    const onAbort = () => onEnd();
    this.logEvents.on(`line:${containerId}`, onLine);
    this.logEvents.on(`end:${containerId}`, onEnd);
    opts.signal?.addEventListener('abort', onAbort);
    try {
      for (;;) {
        while (queue.length) yield queue.shift()!;
        if (ended || opts.signal?.aborted) return;
        await new Promise<void>((r) => (wake = r));
        wake = null;
      }
    } finally {
      this.logEvents.off(`line:${containerId}`, onLine);
      this.logEvents.off(`end:${containerId}`, onEnd);
      opts.signal?.removeEventListener('abort', onAbort);
    }
  }

  /** Image id → size on disk. */
  readonly imageSizes = new Map<string, number>();

  /** Folders cleared as root, and images that can't (no shell). */
  public cleared: Array<{ image: string; hostPath: string }> = [];
  public noShell = new Set<string>();

  async clearFolder(image: string, hostPath: string) {
    this.assertRunning();
    if (this.noShell.has(image)) throw new Error(`${image} has no shell`);
    this.cleared.push({ image, hostPath });
    const { chmodSync, readdirSync, rmSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    // As root would: whatever the permissions, all the way down.
    const unlock = (dir: string) => {
      chmodSync(dir, 0o700);
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) unlock(path);
      }
    };
    for (const entry of readdirSync(hostPath)) {
      const path = join(hostPath, entry);
      if (statSync(path).isDirectory()) unlock(path);
      rmSync(path, { recursive: true, force: true });
    }
  }

  async imageSize(image: string) {
    this.assertRunning();
    return this.imageSizes.get(image) ?? null;
  }

  /** Changes one service's containers (a crash, a healthcheck turning unhealthy). */
  setService(project: string, service: string, patch: Partial<ContainerState>) {
    for (const c of this.containers.get(project) ?? []) if (c.service === service) Object.assign(c, patch);
  }

  private assertRunning() {
    if (!this.running) throw new Error('engine stopped');
  }
}

/** A machine with the given sockets; `engines` maps socket path → engine. */
export function fakeMachine(engines: Record<string, FakeEngine>) {
  return {
    exists: async (path: string) => path in engines,
    connect: (c: EngineCandidate) => engines[c.socketPath]!,
  };
}
