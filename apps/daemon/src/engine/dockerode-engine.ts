import Docker from 'dockerode';
import type { ContainerEngine, ContainerState, EngineInfo, PullProgress } from './types';

/** The real engine, over its unix socket (D-003: dockerode for everything but compose up/down). */
export class DockerodeEngine implements ContainerEngine {
  private readonly docker: Docker;
  /** Pulls take minutes; they get their own client without the 5 s timeout. */
  private readonly slow: Docker;

  constructor(socketPath: string) {
    this.docker = new Docker({ socketPath, timeout: 5_000 });
    this.slow = new Docker({ socketPath });
  }

  async ping(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  async info(): Promise<EngineInfo> {
    const info = (await this.docker.info()) as { ServerVersion?: string; NCPU?: number; MemTotal?: number };
    return { version: info.ServerVersion ?? 'unknown', cpus: info.NCPU ?? 0, memoryBytes: info.MemTotal ?? 0 };
  }

  async ensureNetwork(name: string): Promise<void> {
    const existing = await this.docker.listNetworks({ filters: { name: [name] } });
    if (existing.some((n) => n.Name === name)) return;
    try {
      await this.docker.createNetwork({ Name: name, Driver: 'bridge', Labels: { 'dev.hlabs.network': name } });
    } catch (error) {
      // Created by someone else in the meantime.
      if ((error as { statusCode?: number }).statusCode !== 409) throw error;
    }
  }

  async hasImage(ref: string): Promise<boolean> {
    try {
      await this.docker.getImage(ref).inspect();
      return true;
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) return false;
      throw error;
    }
  }

  async pullImage(ref: string, onProgress: (progress: PullProgress) => void, signal?: AbortSignal): Promise<void> {
    const stream = (await this.slow.pull(ref, { abortSignal: signal })) as NodeJS.ReadableStream;
    const layers = new PullLayers();
    await new Promise<void>((resolve, reject) => {
      this.slow.modem.followProgress(
        stream,
        (error) => (error ? reject(error) : resolve()),
        (event: PullEvent) => {
          if (event.error) return;
          if (layers.update(event)) onProgress(layers.progress());
        },
      );
    });
  }

  async projectContainers(project: string): Promise<ContainerState[]> {
    const list = await this.docker.listContainers({
      all: true,
      filters: { label: [`com.docker.compose.project=${project}`] },
    });
    return Promise.all(
      list.map(async (c) => {
        const inspect = await this.docker.getContainer(c.Id).inspect();
        const started = Date.parse(inspect.State.StartedAt);
        const health = inspect.State.Health?.Status;
        return {
          id: c.Id,
          service: c.Labels['com.docker.compose.service'] ?? '',
          state: inspect.State.Status,
          health: health === 'starting' || health === 'healthy' || health === 'unhealthy' ? health : null,
          image: inspect.Config.Image,
          imageId: inspect.Image,
          startedAt: inspect.State.Running && Number.isFinite(started) ? started : null,
          exitCode: inspect.State.Running ? null : inspect.State.ExitCode,
        };
      }),
    );
  }
}

interface PullEvent {
  id?: string;
  status?: string;
  error?: string;
  progressDetail?: { current?: number; total?: number };
}

/** Sums a pull's layer progress. Layers already present or finished count as done. */
export class PullLayers {
  private readonly layers = new Map<string, { current: number; total: number }>();

  /** Returns true when the totals changed. */
  update(event: PullEvent): boolean {
    if (!event.id || !event.status) return false;
    const layer = this.layers.get(event.id) ?? { current: 0, total: 0 };
    const { current = 0, total = 0 } = event.progressDetail ?? {};
    if (event.status === 'Downloading' && total > 0) {
      layer.total = total;
      layer.current = Math.max(layer.current, Math.min(current, total));
    } else if (/^(Download complete|Pull complete|Already exists|Extracting)/.test(event.status)) {
      layer.current = layer.total;
    } else if (!this.layers.has(event.id) && event.status !== 'Pulling fs layer' && event.status !== 'Waiting') {
      return false;
    }
    this.layers.set(event.id, layer);
    return true;
  }

  progress(): PullProgress {
    let current = 0;
    let total = 0;
    for (const layer of this.layers.values()) {
      current += layer.current;
      total += layer.total;
    }
    return { current, total };
  }
}
