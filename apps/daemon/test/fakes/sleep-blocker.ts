import type { SleepBlocker } from '../../src/platform/keep-awake';

/** Records whether sleep is being held off. */
export class FakeSleepBlocker implements SleepBlocker {
  active = false;
  start() {
    this.active = true;
  }
  stop() {
    this.active = false;
  }
}
