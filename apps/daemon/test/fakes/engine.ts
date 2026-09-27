import type { ContainerEngine, EngineCandidate, EngineInfo } from '../../src/engine/types';

/** In-memory container engine (11-testing-release: only e2e touches real Docker). */
export class FakeEngine implements ContainerEngine {
  constructor(
    public running = true,
    public engineInfo: EngineInfo = { version: '27.0.0-fake', cpus: 4, memoryBytes: 8e9 },
  ) {}
  async ping() {
    return this.running;
  }
  async info() {
    if (!this.running) throw new Error('engine stopped');
    return this.engineInfo;
  }
}

/** A machine with the given sockets; `engines` maps socket path → engine. */
export function fakeMachine(engines: Record<string, FakeEngine>) {
  return {
    exists: async (path: string) => path in engines,
    connect: (c: EngineCandidate) => engines[c.socketPath]!,
  };
}
