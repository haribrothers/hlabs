// The app state machine (docs/prd/02-architecture.md §2.5). Only AppService changes `apps.state`, and only along
// these edges; the reconciler at start may also settle states a crash left behind.
import type { AppState } from '@hlabs/db';

export const APP_TRANSITIONS: Record<AppState, readonly AppState[]> = {
  installing: ['starting', 'install_failed'],
  install_failed: ['installing'],
  starting: ['running', 'error'],
  running: ['stopping', 'restarting', 'updating', 'error', 'uninstalling'],
  stopping: ['stopped'],
  stopped: ['starting', 'uninstalling'],
  restarting: ['running', 'error'],
  updating: ['running', 'rolling_back'],
  rolling_back: ['running', 'error'],
  error: ['starting', 'uninstalling'],
  uninstalling: [],
};

export function canTransition(from: AppState, to: AppState): boolean {
  return APP_TRANSITIONS[from].includes(to);
}

/** `apps.state_detail`: an hlabsCode and the values its copy needs (US-STORE-13), as JSON. */
export interface StateDetail {
  code: string;
  [param: string]: unknown;
}

export function stateDetail(code: string, params: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...params, code } satisfies StateDetail);
}
