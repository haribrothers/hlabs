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
  /** How many times Docker's restart policy has restarted it (absent: 0); a crash loop counts up (US-APP-26). */
  restartCount?: number;
  /** Its last run was killed for using too much memory (absent: false). */
  oomKilled?: boolean;
}

/** One container's usage right now (US-USE-08). Network and disk are totals since it started; rates come from two. */
export interface ContainerStats {
  /** Its share of the whole host's CPU, 0–100 (the same scale as the host CPU tile). */
  cpuPercent: number;
  /** Memory in use without the file cache. */
  memBytes: number;
  netRxBytes: number;
  netTxBytes: number;
  diskReadBytes: number;
  diskWriteBytes: number;
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
  /** Removes it, when it's there (uninstalling hlabs, D-143). */
  removeNetwork(name: string): Promise<void>;
  hasImage(ref: string): Promise<boolean>;
  pullImage(ref: string, onProgress: (progress: PullProgress) => void, signal?: AbortSignal): Promise<void>;
  /** Containers labelled with the compose project, running or not. */
  projectContainers(project: string): Promise<ContainerState[]>;
  /**
   * A container's log lines, oldest first: the last `tail` (all without it), only those after `since` (ms) when
   * given, and with `follow` the new ones as they come until the container stops, `until` (ms) passes or `signal`
   * aborts. Following with `until` streams everything Docker kept without holding it in memory.
   */
  containerLogs(
    containerId: string,
    opts: { tail?: number; since?: number; until?: number; follow?: boolean; signal?: AbortSignal },
  ): AsyncIterable<ContainerLogLine>;
  /** One container's usage now (`docker stats` once, without streaming). */
  containerStats(containerId: string, signal?: AbortSignal): Promise<ContainerStats>;
  /**
   * Removes an image (a reference or `sha256:…`) so the next pull downloads it again (US-APP-25). An image that's
   * already gone, or that a container still uses, is left as it is.
   */
  removeImage(image: string): Promise<void>;
  /** An image's size on disk (`sha256:…` or a reference), or null when it isn't here. */
  imageSize(image: string): Promise<number | null>;
  /**
   * Empties a folder on this computer from inside a throwaway container of `image`, run as root: for an app's data
   * that the app wrote as root or another user, which hlabs can't delete itself on Linux. Throws when the image can't
   * do it (no shell) or the container fails.
   */
  clearFolder(image: string, hostPath: string): Promise<void>;
  /** Freezes a running container for a consistent backup copy (US-BKP-05); `unpause` lets it go on. */
  pauseContainer(containerId: string): Promise<void>;
  unpauseContainer(containerId: string): Promise<void>;
  /** Runs `sh -c <command>` inside a running container (a manifest's `backup.preHook`, e.g. pg_dumpall). */
  execInContainer(
    containerId: string,
    command: string,
    signal?: AbortSignal,
  ): Promise<{ exitCode: number; output: string }>;
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
