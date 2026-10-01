import type { ContainerLogLine } from './log-frames';
import type { EngineKind } from '@hlabs/api';

export interface EngineInfo {
  version: string;
  cpus: number;
  memoryBytes: number;
}

/** One container of an app's compose project. */
export interface ContainerState {
  id: string;
  /** The compose service it runs. */
  service: string;
  /** Docker's state: created, running, restarting, exited, paused or dead. */
  state: string;
  /** From the image's or compose file's healthcheck; null when there is none. */
  health: 'starting' | 'healthy' | 'unhealthy' | null;
  /** The image as the compose file names it. */
  image: string;
  /** `sha256:…` of the image it runs, for update snapshots. */
  imageId: string;
  startedAt: number | null;
  exitCode: number | null;
}

/** Bytes of an image pull so far, summed over its layers. `total` grows as layers report their size. */
export interface PullProgress {
  current: number;
  total: number;
}

/** The container engine as the daemon uses it; dockerode in production, a fake in tests (11 §Test pyramid).
 * Stacks go up and down through the compose CLI instead (D-003). */
export interface ContainerEngine {
  ping(): Promise<boolean>;
  info(): Promise<EngineInfo>;
  /** Creates the shared bridge network if it doesn't exist. */
  ensureNetwork(name: string): Promise<void>;
  hasImage(ref: string): Promise<boolean>;
  pullImage(ref: string, onProgress: (progress: PullProgress) => void, signal?: AbortSignal): Promise<void>;
  /** Containers labelled with the compose project, running or not. */
  projectContainers(project: string): Promise<ContainerState[]>;
  /**
   * A container's log lines, oldest first: the last `tail` (all without it), only those after `since` (ms) when
   * given, and with `follow` the new ones as they come until the container stops or `signal` aborts.
   */
  containerLogs(
    containerId: string,
    opts: { tail?: number; since?: number; follow?: boolean; signal?: AbortSignal },
  ): AsyncIterable<ContainerLogLine>;
  /** An image's size on disk (`sha256:…` or a reference), or null when it isn't here. */
  imageSize(image: string): Promise<number | null>;
}

export interface EngineCandidate {
  kind: EngineKind;
  socketPath: string;
  /** hlabs installed it (Colima profile `hlabs`). */
  managedByHlabs: boolean;
}

export type EngineStatus =
  | { state: 'running'; candidate: EngineCandidate; info: EngineInfo }
  | { state: 'stopped'; candidate: EngineCandidate }
  | { state: 'missing' };
