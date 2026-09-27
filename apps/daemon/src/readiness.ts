// What /healthz reports while the daemon boots (02 §2.3, 05 "From 11 · System states").
import type { HealthReason, HealthUnavailable } from '@hlabs/api';

export const BOOT_STEPS = [
  'Opening the database',
  'Finding the container engine',
  'Starting the web proxy',
  'Checking your apps',
  'Starting the scheduler',
] as const;

type State =
  | { kind: 'starting'; step: number }
  | { kind: 'ready' }
  | { kind: 'failed'; reason: Extract<HealthReason, 'migration_failed' | 'storage_unavailable'> };

export class Readiness {
  private state: State = { kind: 'starting', step: 0 };

  step(step: number): void {
    this.state = { kind: 'starting', step };
  }

  ready(): void {
    this.state = { kind: 'ready' };
  }

  fail(reason: Extract<HealthReason, 'migration_failed' | 'storage_unavailable'>): void {
    this.state = { kind: 'failed', reason };
  }

  get isReady(): boolean {
    return this.state.kind === 'ready';
  }

  /** The 503 body, or null when ready. */
  unavailable(): HealthUnavailable | null {
    switch (this.state.kind) {
      case 'ready':
        return null;
      case 'failed':
        return { reason: this.state.reason };
      case 'starting':
        return {
          reason: 'starting',
          step: this.state.step + 1,
          steps: BOOT_STEPS.length,
          stepLabel: BOOT_STEPS[this.state.step] ?? BOOT_STEPS[0],
        };
    }
  }
}
