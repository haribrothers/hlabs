// Types the daemon uses to implement the router: one handler per procedure path.
import type {
  AnyTRPCProcedure,
  inferProcedureInput,
  inferProcedureOutput,
  TrackedEnvelope,
  TRPCRouterRecord,
} from '@trpc/server';
import type { AppRouter } from './router';

/** tRPC reports tracked items as { id, data }; handlers yield the TrackedEnvelope that `tracked()` returns. */
type Untracked<T> = T extends { id: string; data: infer D } ? TrackedEnvelope<D> : T;

type SubscriptionItem<P extends AnyTRPCProcedure> =
  inferProcedureOutput<P> extends AsyncIterable<infer T, infer _R, infer _N> ? Untracked<T> : never;

export type ProcedureHandler<P extends AnyTRPCProcedure, C> = P['_def']['type'] extends 'subscription'
  ? (input: inferProcedureInput<P>, ctx: C, signal: AbortSignal | undefined) => AsyncIterable<SubscriptionItem<P>>
  : (
      input: inferProcedureInput<P>,
      ctx: C,
      signal: AbortSignal | undefined,
    ) => Promise<inferProcedureOutput<P>> | inferProcedureOutput<P>;

export type HandlerTree<R extends TRPCRouterRecord, C> = {
  [K in keyof R]?: R[K] extends AnyTRPCProcedure
    ? ProcedureHandler<R[K], C>
    : R[K] extends TRPCRouterRecord
      ? HandlerTree<R[K], C>
      : never;
};

/** Handlers for the whole API; missing ones answer NOT_IMPLEMENTED. */
export type AppHandlers<C> = HandlerTree<AppRouter['_def']['record'], C>;
