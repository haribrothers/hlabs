import type {
  ContainerEngine,
  ContainerState,
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

  async projectContainers(project: string) {
    this.assertRunning();
    return structuredClone(this.containers.get(project) ?? []);
  }

  /** Image id → size on disk. */
  readonly imageSizes = new Map<string, number>();

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
