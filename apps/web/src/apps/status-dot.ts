// The StatusDot for an app state, shared by the app window and App settings.
import type { AppState } from '@hlabs/api';
import type { Status } from '@hlabs/ui';

/** Colour never alone: the label says it too. */
export function statusDot(state: AppState): Status {
  if (state === 'running') return 'running';
  if (state === 'stopped') return 'stopped';
  if (state === 'error' || state === 'install_failed') return 'failed';
  return 'working';
}
