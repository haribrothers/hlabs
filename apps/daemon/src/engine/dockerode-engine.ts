import Docker from 'dockerode';
import type { ContainerEngine, EngineInfo } from './types';

/** The real engine, over its unix socket (D-003: dockerode for everything but compose up/down). */
export class DockerodeEngine implements ContainerEngine {
  private readonly docker: Docker;

  constructor(socketPath: string) {
    this.docker = new Docker({ socketPath, timeout: 5_000 });
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
}
