import Docker from 'dockerode';
import { LogFrames, type ContainerLogLine } from './log-frames';
import type { ContainerEngine, ContainerStats, ContainerState, EngineInfo, PullProgress } from './types';

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

  async *containerLogs(
    containerId: string,
    opts: { tail?: number; since?: number; until?: number; follow?: boolean; signal?: AbortSignal },
  ): AsyncGenerator<ContainerLogLine> {
    const container = this.docker.getContainer(containerId);
    const frames = new LogFrames((await container.inspect()).Config.Tty);
    const options = {
      stdout: true,
      stderr: true,
      timestamps: true,
      // Without a tail, every line Docker kept.
      ...(opts.tail === undefined ? {} : { tail: opts.tail }),
      // Docker takes seconds, with a fraction.
      since: opts.since === undefined ? 0 : opts.since / 1000,
      ...(opts.until === undefined ? {} : { until: opts.until / 1000 }),
    };
    if (!opts.follow) {
      const all = await container.logs({ ...options, follow: false });
      yield* frames.push(all);
      yield* frames.flush();
      return;
    }
    // A followed stream can be quiet for a long time: the client without the timeout.
    const followed = this.slow.getContainer(containerId);
    const stream = (await followed.logs({ ...options, follow: true })) as NodeJS.ReadableStream & {
      destroy?: () => void;
    };
    const stop = () => stream.destroy?.();
    opts.signal?.addEventListener('abort', stop);
    try {
      for await (const chunk of stream) yield* frames.push(chunk as Buffer);
      yield* frames.flush();
    } catch (err) {
      if (!opts.signal?.aborted) throw err;
    } finally {
      opts.signal?.removeEventListener('abort', stop);
      stop();
    }
  }

  async clearFolder(image: string, hostPath: string): Promise<void> {
    const container = await this.slow.createContainer({
      Image: image,
      User: '0:0',
      Entrypoint: ['/bin/sh', '-c', 'rm -rf /hlabs-clear/* /hlabs-clear/.[!.]* /hlabs-clear/..?*'],
      Cmd: [],
      Labels: { 'dev.hlabs.clear': 'true' },
      HostConfig: { Binds: [`${hostPath}:/hlabs-clear`], NetworkMode: 'none' },
    });
    try {
      await container.start();
      const { StatusCode } = (await container.wait()) as { StatusCode: number };
      if (StatusCode !== 0) throw new Error(`clearing ${hostPath} with ${image} exited ${StatusCode}`);
    } finally {
      await container.remove({ force: true }).catch(() => undefined);
    }
  }

  async containerStats(containerId: string, signal?: AbortSignal): Promise<ContainerStats> {
    const raw = (await this.docker
      .getContainer(containerId)
      .stats({ stream: false, abortSignal: signal } as never)) as unknown as DockerStats;
    return parseDockerStats(raw);
  }

  async imageSize(image: string): Promise<number | null> {
    try {
      return (await this.docker.getImage(image).inspect()).Size;
    } catch {
      return null;
    }
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
          // A crash-looping container is "restarting" (and Running) with the exit code of its last run.
          exitCode: inspect.State.Running && !inspect.State.Restarting ? null : inspect.State.ExitCode,
        };
      }),
    );
  }
}

/** The parts of `GET /containers/{id}/stats?stream=false` hlabs reads. */
export interface DockerStats {
  cpu_stats?: { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number; online_cpus?: number };
  precpu_stats?: { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number };
  memory_stats?: { usage?: number; stats?: { inactive_file?: number; total_inactive_file?: number; cache?: number } };
  networks?: Record<string, { rx_bytes?: number; tx_bytes?: number }>;
  blkio_stats?: { io_service_bytes_recursive?: Array<{ op?: string; value?: number }> | null };
}

/**
 * CPU as a share of the whole host (Docker's own percent is per CPU, up to 100 × cores), memory without the file
 * cache (as `docker stats` shows it), and network and disk totals.
 */
export function parseDockerStats(s: DockerStats): ContainerStats {
  const cpuDelta = (s.cpu_stats?.cpu_usage?.total_usage ?? 0) - (s.precpu_stats?.cpu_usage?.total_usage ?? 0);
  const systemDelta = (s.cpu_stats?.system_cpu_usage ?? 0) - (s.precpu_stats?.system_cpu_usage ?? 0);
  const cpuPercent = cpuDelta > 0 && systemDelta > 0 ? Math.min(100, (cpuDelta / systemDelta) * 100) : 0;
  const mem = s.memory_stats;
  const cache = mem?.stats?.inactive_file ?? mem?.stats?.total_inactive_file ?? mem?.stats?.cache ?? 0;
  const networks = Object.values(s.networks ?? {});
  const io = s.blkio_stats?.io_service_bytes_recursive ?? [];
  const sumIo = (op: string) => io.filter((e) => e.op?.toLowerCase() === op).reduce((n, e) => n + (e.value ?? 0), 0);
  return {
    cpuPercent,
    memBytes: Math.max(0, (mem?.usage ?? 0) - cache),
    netRxBytes: networks.reduce((n, x) => n + (x.rx_bytes ?? 0), 0),
    netTxBytes: networks.reduce((n, x) => n + (x.tx_bytes ?? 0), 0),
    diskReadBytes: sumIo('read'),
    diskWriteBytes: sumIo('write'),
  };
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
