import type { ColimaResources, EngineControl } from '../../src/engine/control';
import type { EngineCandidate } from '../../src/engine/types';

/** Records what it was asked to do; `onRestart` lets a test stop or start the fake engine meanwhile. */
export class FakeEngineControl implements EngineControl {
  restarts: EngineCandidate[] = [];
  applied: ColimaResources[] = [];
  onRestart: () => void | Promise<void> = () => {};
  starts: EngineCandidate[] = [];
  onStart: () => void | Promise<void> = () => {};
  async start(candidate: EngineCandidate) {
    this.starts.push(candidate);
    await this.onStart();
  }
  async restart(candidate: EngineCandidate) {
    this.restarts.push(candidate);
    await this.onRestart();
  }
  async restartColimaWith(resources: ColimaResources) {
    this.applied.push(resources);
    await this.onRestart();
  }
}
