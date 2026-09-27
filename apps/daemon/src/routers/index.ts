// Handlers by procedure path. Routers are thin: the input is already validated by @hlabs/api, access
// is checked by DaemonContext.authorize, and the work happens in services. Missing paths → NOT_IMPLEMENTED.
import { listProcedures, type AppHandlers } from '@hlabs/api';
import type { DaemonContext, Dispatcher } from '../context';
import { events } from './events';
import { jobs } from './jobs';
import { onboarding } from './onboarding';
import { system } from './system';

export const handlers: AppHandlers<DaemonContext> = { system, jobs, events, onboarding };

type Fn = (input: unknown, ctx: DaemonContext, signal: AbortSignal | undefined) => unknown;

const SUBSCRIPTIONS = new Set(
  listProcedures()
    .filter((p) => p.type === 'subscription')
    .map((p) => p.path),
);

function flatten(tree: object, prefix = '', out = new Map<string, Fn>()): Map<string, Fn> {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'function') out.set(path, value as Fn);
    else if (value && typeof value === 'object') flatten(value, path, out);
  }
  return out;
}

const byPath = flatten(handlers);

export function handlerFor(path: string) {
  if (SUBSCRIPTIONS.has(path)) return undefined;
  const fn = byPath.get(path);
  return fn && (async (input: unknown, ctx: DaemonContext, signal: AbortSignal | undefined) => fn(input, ctx, signal));
}

export function subscriptionFor(path: string) {
  if (!SUBSCRIPTIONS.has(path)) return undefined;
  return byPath.get(path) as
    ((input: unknown, ctx: DaemonContext, signal: AbortSignal | undefined) => AsyncIterable<unknown>) | undefined;
}

export const implementedPaths = (): string[] => [...byPath.keys()].sort();

export const dispatcher: Dispatcher = { handlerFor, subscriptionFor };
