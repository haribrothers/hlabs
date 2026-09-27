// The tRPC request context: who is calling, and how procedures reach their handlers.
import { hlabsError, type Access, type ApiContext } from '@hlabs/api';
import type { Listener } from './events/bus';
import type { Services } from './services';

/** Who made the request. Sessions and the tray token are resolved here from phase 1 and 4. */
export type Identity =
  { kind: 'anonymous' } | { kind: 'user'; userId: string; role: 'admin' | 'member' } | { kind: 'tray' };

export interface RequestInfo {
  ip: string;
  userAgent: string | null;
}

type Handler = (input: unknown, ctx: DaemonContext, signal: AbortSignal | undefined) => Promise<unknown>;
type SubscriptionHandler = (
  input: unknown,
  ctx: DaemonContext,
  signal: AbortSignal | undefined,
) => AsyncIterable<unknown>;

/** Finds the handler for a procedure path (routers/index.ts). */
export interface Dispatcher {
  handlerFor(path: string): Handler | undefined;
  subscriptionFor(path: string): SubscriptionHandler | undefined;
}

export class DaemonContext implements ApiContext {
  constructor(
    private readonly holder: { current: Services | null },
    private readonly dispatcher: Dispatcher,
    readonly identity: Identity,
    readonly request: RequestInfo,
  ) {}

  /** Services, or DAEMON_STARTING before boot finished. */
  get services(): Services {
    const services = this.holder.current;
    if (!services || !services.readiness.isReady) throw hlabsError('DAEMON_STARTING');
    return services;
  }

  /** The event-stream listener for this caller. */
  get listener(): Listener {
    const id = this.identity;
    if (id.kind === 'tray') return { kind: 'tray' };
    if (id.kind === 'user') return { kind: 'user', userId: id.userId, role: id.role };
    throw hlabsError('AUTH_REQUIRED');
  }

  authorize(access: readonly Access[], _path: string): void {
    if (access.includes('public')) return;
    const id = this.identity;
    if (id.kind === 'tray') {
      if (access.includes('tray')) return;
      throw hlabsError('ACCESS_DENIED');
    }
    if (id.kind === 'user') {
      if (access.includes('authed')) return;
      if (access.includes('admin') && id.role === 'admin') return;
      // Setup-token checks arrive with onboarding (phase 1, D-013).
      throw hlabsError('ACCESS_DENIED');
    }
    if (access.includes('setup')) throw hlabsError('ONBOARDING_SETUP_TOKEN_REQUIRED');
    throw hlabsError('AUTH_REQUIRED');
  }

  async handle(path: string, input: unknown, signal: AbortSignal | undefined): Promise<unknown> {
    const handler = this.dispatcher.handlerFor(path);
    if (!handler) throw hlabsError('NOT_IMPLEMENTED', `${path} is not implemented yet`);
    return handler(input, this, signal);
  }

  subscribe(path: string, input: unknown, signal: AbortSignal | undefined): AsyncIterable<unknown> {
    const handler = this.dispatcher.subscriptionFor(path);
    if (!handler) throw hlabsError('NOT_IMPLEMENTED', `${path} is not implemented yet`);
    return handler(input, this, signal);
  }
}
