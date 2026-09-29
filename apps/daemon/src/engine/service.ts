// Keeps track of the container engine. When it's missing or stopped the daemon still starts
// (engine-stopped mode) and retries every 10 s (02 §2.3 step 2).
import type { EngineKind } from '@hlabs/api';
import { access, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { EventBus } from '../events/bus';
import type { Logger } from '../logger';
import { detectEngine, engineCandidates, type DetectDeps } from './detect';
import { DockerodeEngine } from './dockerode-engine';
import type { ContainerEngine, EngineCandidate, EngineStatus } from './types';

export const ENGINE_RETRY_MS = 10_000;

export interface EngineServiceDeps {
  bus: EventBus;
  logger: Logger;
  /** Candidate list; defaults to the real sockets on this machine. */
  candidates?: () => Promise<EngineCandidate[]>;
  detect?: DetectDeps;
  retryMs?: number;
  preferred?: () => EngineKind | 'auto';
}

export class EngineService {
  private current: EngineStatus = { state: 'missing' };
  private engine: ContainerEngine | null = null;
  private timer: NodeJS.Timeout | null = null;
  private checking: Promise<EngineStatus> | null = null;

  constructor(private readonly deps: EngineServiceDeps) {}

  get status(): EngineStatus {
    return this.current;
  }

  /** The running engine, or null in engine-stopped mode. */
  get client(): ContainerEngine | null {
    return this.engine;
  }

  async start(): Promise<EngineStatus> {
    const status = await this.check();
    this.timer = setInterval(() => void this.check(), this.deps.retryMs ?? ENGINE_RETRY_MS);
    this.timer.unref();
    return status;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Detect now. Emits engine.status when the state changes. */
  check(): Promise<EngineStatus> {
    this.checking ??= this.runCheck().finally(() => (this.checking = null));
    return this.checking;
  }

  private async runCheck(): Promise<EngineStatus> {
    // While running, a ping is enough; only re-detect when it stops answering.
    if (this.current.state === 'running' && this.engine && (await this.engine.ping())) return this.current;

    const candidates = await (this.deps.candidates ?? (() => defaultCandidates(this.deps.preferred?.() ?? 'auto')))();
    const { status, engine } = await detectEngine(candidates, this.deps.detect ?? realDetectDeps);
    const changed = describe(status) !== describe(this.current);
    this.current = status;
    this.engine = engine;
    if (changed) {
      this.deps.logger.info({ engine: describe(status) }, 'container engine status changed');
      const candidate = status.state === 'missing' ? null : status.candidate;
      this.deps.bus.emit('engine.status', {
        running: status.state === 'running',
        kind: candidate?.kind ?? null,
        managedByHlabs: candidate?.managedByHlabs ?? false,
        socketPath: candidate?.socketPath ?? null,
      });
    }
    return status;
  }
}

function describe(status: EngineStatus): string {
  return status.state === 'missing' ? 'missing' : `${status.state}:${status.candidate.socketPath}`;
}

const realDetectDeps: DetectDeps = {
  exists: (path) =>
    access(path).then(
      () => true,
      () => false,
    ),
  connect: (candidate) => new DockerodeEngine(candidate.socketPath),
};

export async function defaultCandidates(preferred: EngineKind | 'auto'): Promise<EngineCandidate[]> {
  const home = homedir();
  const colimaProfiles = await readdir(join(home, '.colima'), { withFileTypes: true }).then(
    (entries) => entries.filter((e) => e.isDirectory()).map((e) => e.name),
    () => [],
  );
  return engineCandidates({ home, env: process.env, colimaProfiles, preferred });
}
