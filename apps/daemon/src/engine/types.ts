import type { EngineKind } from '@hlabs/api';

export interface EngineInfo {
  version: string;
  cpus: number;
  memoryBytes: number;
}

/** The container engine as the daemon uses it; dockerode in production, a fake in tests (11 §Test pyramid). */
export interface ContainerEngine {
  ping(): Promise<boolean>;
  info(): Promise<EngineInfo>;
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
