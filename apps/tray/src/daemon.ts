// The tray window's calls to hlabsd (US-INST-15). They go through the Rust `daemon_call` command, which adds the tray
// token; the webview never holds it. Only `tray.*` procedures accept the token.
import type { AppRouter } from '@hlabs/api';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { invoke } from '@tauri-apps/api/core';

type Inputs = inferRouterInputs<AppRouter>['tray'];
type Outputs = inferRouterOutputs<AppRouter>['tray'];
type Procedure = keyof Inputs & keyof Outputs;

/** How a call failed, as the Rust side reports it (daemon.rs `DaemonError`). */
export type DaemonFailure =
  | { kind: 'unreachable' }
  | { kind: 'tokenRejected' }
  | { kind: 'api'; hlabsCode: string; status: number }
  | { kind: 'protocol' };

export class DaemonCallError extends Error {
  constructor(readonly failure: DaemonFailure) {
    super(failure.kind === 'api' ? failure.hlabsCode : failure.kind);
    this.name = 'DaemonCallError';
  }
}

function isFailure(value: unknown): value is DaemonFailure {
  return typeof value === 'object' && value !== null && typeof (value as { kind?: unknown }).kind === 'string';
}

async function call<P extends Procedure>(kind: 'query' | 'mutation', path: P, input?: Inputs[P]): Promise<Outputs[P]> {
  try {
    return await invoke<Outputs[P]>('daemon_call', { kind, path: `tray.${path}`, input: input ?? null });
  } catch (err) {
    throw new DaemonCallError(isFailure(err) ? err : { kind: 'protocol' });
  }
}

export const daemon = {
  query: <P extends Procedure>(path: P, input?: Inputs[P]) => call('query', path, input),
  mutate: <P extends Procedure>(path: P, input?: Inputs[P]) => call('mutation', path, input),
};
