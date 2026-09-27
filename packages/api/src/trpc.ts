// The tRPC root for hlabs. Procedures here only declare access and contracts; the daemon supplies
// the context that authorizes callers and runs the implementation (ctx.handle / ctx.subscribe).
import { initTRPC } from '@trpc/server';
import type { z } from 'zod';
import { hlabsCodeOf, HlabsError } from './errors';

/** Who may call a procedure (05 §Conventions). */
export type Access = 'public' | 'setup' | 'authed' | 'admin' | 'tray';

export interface ProcedureMeta {
  access: readonly Access[];
}

/** Implemented by the daemon's request context. */
export interface ApiContext {
  /** Throws a TRPCError (AUTH_REQUIRED, ACCESS_DENIED, ONBOARDING_SETUP_TOKEN_REQUIRED …) when not allowed. */
  authorize(access: readonly Access[], path: string): void | Promise<void>;
  /** Runs the procedure at `path`; unimplemented paths throw NOT_IMPLEMENTED. */
  handle(path: string, input: unknown, signal: AbortSignal | undefined): Promise<unknown>;
  /** Runs the subscription at `path`. */
  subscribe(path: string, input: unknown, signal: AbortSignal | undefined): AsyncIterable<unknown>;
}

const t = initTRPC
  .context<ApiContext>()
  .meta<ProcedureMeta>()
  .create({
    errorFormatter({ shape, error }) {
      const detail = error.cause instanceof HlabsError ? (error.cause.detail ?? null) : null;
      return { ...shape, data: { ...shape.data, hlabsCode: hlabsCodeOf(error), detail } };
    },
    sse: {
      ping: { enabled: true, intervalMs: 15_000 },
      client: { reconnectAfterInactivityMs: 40_000 },
    },
  });

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

function withAccess(...access: Access[]) {
  return t.procedure.meta({ access }).use(async ({ ctx, path, next }) => {
    await ctx.authorize(access, path);
    return next();
  });
}

export const procedures = {
  public: withAccess('public'),
  setup: withAccess('setup'),
  authed: withAccess('authed'),
  admin: withAccess('admin'),
  tray: withAccess('tray'),
  authedOrTray: withAccess('authed', 'tray'),
};

type Base = (typeof procedures)[keyof typeof procedures];
interface IO<I extends z.ZodType, O extends z.ZodType> {
  input: I;
  output: O;
}

export function query<I extends z.ZodType, O extends z.ZodType>(base: Base, io: IO<I, O>) {
  return base
    .input(io.input)
    .output(io.output)
    .query(async ({ ctx, input, path, signal }) => (await ctx.handle(path, input, signal)) as never);
}

export function mutation<I extends z.ZodType, O extends z.ZodType>(base: Base, io: IO<I, O>) {
  return base
    .input(io.input)
    .output(io.output)
    .mutation(async ({ ctx, input, path, signal }) => (await ctx.handle(path, input, signal)) as never);
}

/** A subscription whose items are yielded by the daemon (typed by the caller via `Item`). */
export function subscription<Item, I extends z.ZodType>(base: Base, input: I) {
  return base.input(input).subscription(async function* ({ ctx, input, path, signal }) {
    for await (const item of ctx.subscribe(path, input, signal)) yield item as Item;
  });
}

export const io = <I extends z.ZodType, O extends z.ZodType>(input: I, output: O): IO<I, O> => ({ input, output });
