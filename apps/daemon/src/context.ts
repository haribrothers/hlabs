// The tRPC request context: who is calling, and how procedures reach their handlers.
import { hlabsError, listProcedures, type Access, type ApiContext } from '@hlabs/api';
import { csrfMatches } from './auth/sessions';
import type { Listener } from './events/bus';
import { memberSeesUsage } from './home/layout';
import type { Services } from './services';

/**
 * Who made the request. A signed-in user comes from the session cookie (`session` holds its raw id, for CSRF);
 * without `session` it is the development-only anonymous admin. The tray token arrives in phase 4.
 */
export type Identity =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string; role: 'admin' | 'member'; session?: { id: string; raw: string; remember: boolean } }
  | { kind: 'tray' };

export interface RequestInfo {
  ip: string;
  userAgent: string | null;
  /** The `x-hlabs-setup` header (D-013). */
  setupToken: string | null;
  /** The `x-hlabs-csrf` header (07 §7.3). */
  csrfToken: string | null;
  /** The `Origin` header; mutations from a session must come from the dashboard. */
  origin: string | null;
  /** The `Host` header, for the cookie's Domain (US-AUTH-14). */
  host: string | null;
  /** Origins the dashboard is served from. */
  allowedOrigins: readonly string[];
  /** Adds a Set-Cookie header to the response. */
  setCookie(cookie: string): void;
}

const MUTATIONS = new Set(
  listProcedures()
    .filter((p) => p.type === 'mutation')
    .map((p) => p.path),
);

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
    if (id.kind === 'user') return { kind: 'user', userId: id.userId, role: id.role, sessionId: id.session?.id };
    throw hlabsError('AUTH_REQUIRED');
  }

  authorize(access: readonly Access[], path: string): void {
    if (access.includes('public')) return;
    const id = this.identity;
    if (access.includes('setup')) {
      const { onboarding } = this.services;
      if (onboarding.completed) throw hlabsError('ONBOARDING_COMPLETE');
      // Once an admin exists, creating one answers the same for every caller: it already exists (US-ONB-10).
      if (path === 'onboarding.createAdmin' && onboarding.status().hasUsers) throw hlabsError('ONBOARDING_USERS_EXIST');
      // Until an admin exists only the setup token counts (D-013); after that, only the admin's session
      // (US-ONB-03) — never the development-only anonymous admin.
      if (!onboarding.status().hasUsers) {
        if (onboarding.verifySetupToken(this.request.setupToken)) return;
        throw hlabsError('ONBOARDING_SETUP_TOKEN_REQUIRED');
      }
      if (id.kind !== 'user' || !id.session) throw hlabsError('AUTH_REQUIRED');
      if (id.role !== 'admin') throw hlabsError('ACCESS_DENIED');
      this.checkCsrf(path);
      return;
    }
    if (id.kind === 'tray') {
      if (access.includes('tray')) return;
      throw hlabsError('ACCESS_DENIED');
    }
    if (id.kind === 'user') {
      const allowed = access.includes('authed') || (access.includes('admin') && id.role === 'admin');
      if (!allowed) throw hlabsError('ACCESS_DENIED');
      // Live usage for members needs "See live usage" for members and their own switch (US-ACCT-20, D-029, 07 §7.4).
      if (path.startsWith('usage.') && id.role !== 'admin' && !memberSeesUsage(this.services.db, id.userId)) {
        throw hlabsError('ACCESS_DENIED');
      }
      this.checkCsrf(path);
      return;
    }
    throw hlabsError('AUTH_REQUIRED');
  }

  /** Mutations made with a session need the CSRF header and must come from the dashboard (07 §7.3). */
  private checkCsrf(path: string): void {
    const id = this.identity;
    if (!MUTATIONS.has(path) || id.kind !== 'user' || !id.session) return;
    const { origin, allowedOrigins, csrfToken } = this.request;
    if (origin !== null && !allowedOrigins.includes(origin)) throw hlabsError('CSRF_REJECTED');
    if (!csrfMatches(id.session.raw, csrfToken)) throw hlabsError('CSRF_REJECTED');
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
