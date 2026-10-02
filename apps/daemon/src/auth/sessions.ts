// Sessions (07 §7.3): a random 32-byte id lives only in the `hlabs_session` cookie; the database keeps its
// SHA-256. Idle timeout 12 h, or 30 days sliding with "Remember me". CSRF tokens are derived from the raw id.
import { sessions, users, type HlabsDb } from '@hlabs/db';
import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { EventBus } from '../events/bus';

export const SESSION_COOKIE = 'hlabs_session';
export const IDLE_MS = 12 * 60 * 60 * 1000;
export const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
/** lastSeenAt is written at most this often. */
const TOUCH_MS = 60 * 1000;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export interface ResolvedSession {
  sessionId: string;
  userId: string;
  role: 'admin' | 'member';
  remember: boolean;
  expiresAt: number;
}

/** The double-submit CSRF token for a session: only someone who can read the cookie's id can compute it. */
export function csrfTokenFor(rawSessionId: string): string {
  return createHash('sha256').update(`csrf:${rawSessionId}`).digest('base64url');
}

export function csrfMatches(rawSessionId: string, header: string | null): boolean {
  if (!header) return false;
  const expected = Buffer.from(csrfTokenFor(rawSessionId));
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class SessionService {
  constructor(
    private readonly db: HlabsDb,
    private readonly bus?: EventBus,
  ) {}

  /**
   * A person's live sessions (US-ACCT-04): not revoked, not expired; the current one first, then by last activity.
   */
  listFor(userId: string, currentId: string | null, now = Date.now()) {
    const rows = this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
      .orderBy(desc(sessions.lastSeenAt))
      .all();
    const current = rows.filter((r) => r.id === currentId);
    return [...current, ...rows.filter((r) => r.id !== currentId)].map((r) => ({
      id: r.id,
      current: r.id === currentId,
      userAgent: r.userAgent,
      ip: r.ip,
      createdAt: r.createdAt,
      lastSeenAt: r.lastSeenAt,
    }));
  }

  /**
   * Ends sessions now (US-AUTH-15): one session, or all of a user's (optionally but one). Each device still
   * connected hears `session.revoked` on its own event stream and goes to log in. Returns the ended ids.
   */
  revoke(which: { sessionId: string } | { userId: string; except?: string }, now = Date.now()): string[] {
    const where =
      'sessionId' in which
        ? and(eq(sessions.id, which.sessionId), isNull(sessions.revokedAt))
        : and(
            eq(sessions.userId, which.userId),
            isNull(sessions.revokedAt),
            ...(which.except ? [ne(sessions.id, which.except)] : []),
          );
    const ended = this.db
      .update(sessions)
      .set({ revokedAt: now })
      .where(where)
      .returning({ id: sessions.id })
      .all()
      .map((r) => r.id);
    for (const sessionId of ended) this.bus?.emit('session.revoked', { sessionId }, { kind: 'session', sessionId });
    return ended;
  }

  /** Ends every live session that `match` picks (tailnet sessions on disconnect, US-SYS-03); returns their ids. */
  revokeWhere(match: (s: typeof sessions.$inferSelect) => boolean, now = Date.now()): string[] {
    const live = this.db.select().from(sessions).where(isNull(sessions.revokedAt)).all().filter(match);
    return live.flatMap((s) => this.revoke({ sessionId: s.id }, now));
  }

  create(opts: { userId: string; remember?: boolean; ip?: string | null; userAgent?: string | null; now?: number }) {
    const now = opts.now ?? Date.now();
    const raw = randomBytes(32).toString('base64url');
    const remember = opts.remember ?? false;
    const expiresAt = now + (remember ? REMEMBER_MS : IDLE_MS);
    this.db
      .insert(sessions)
      .values({
        id: sha256(raw),
        userId: opts.userId,
        createdAt: now,
        lastSeenAt: now,
        expiresAt,
        remember,
        userAgent: opts.userAgent ?? null,
        ip: opts.ip ?? null,
      })
      .run();
    // `issuedAt`: the cookie's Max-Age counts from here, so it's exactly 30 days however long the request takes.
    return { raw, expiresAt, remember, issuedAt: now };
  }

  /** The signed-in user for a cookie, sliding the expiry; null when unknown, revoked, expired or disabled. */
  resolve(raw: string | null | undefined, now = Date.now()): ResolvedSession | null {
    if (!raw) return null;
    const row = this.db
      .select({ session: sessions, role: users.role, disabledAt: users.disabledAt })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, sha256(raw)), isNull(sessions.revokedAt)))
      .get();
    if (!row || row.disabledAt !== null || row.session.expiresAt <= now) return null;
    let expiresAt = row.session.expiresAt;
    if (now - row.session.lastSeenAt >= TOUCH_MS) {
      expiresAt = now + (row.session.remember ? REMEMBER_MS : IDLE_MS);
      this.db.update(sessions).set({ lastSeenAt: now, expiresAt }).where(eq(sessions.id, row.session.id)).run();
    }
    return {
      sessionId: row.session.id,
      userId: row.session.userId,
      role: row.role,
      remember: row.session.remember,
      expiresAt,
    };
  }
}

/**
 * The cookie's Domain (US-AUTH-14): `.<hostname>.local` when the dashboard is reached on its mDNS name, so app
 * hostnames under it share the session; otherwise none, so it stays on the host it was set on (tailnet name, an IP or
 * a fallback port).
 */
export function cookieDomain(host: string | null, hostname: string): string | undefined {
  const name = host?.replace(/:\d+$/, '').toLowerCase();
  const local = `${hostname.toLowerCase()}.local`;
  return name === local ? `.${local}` : undefined;
}

/** `hlabs_session` cookie: HttpOnly, Secure, SameSite=Lax, Path=/; persistent only with "Remember me". */
export function sessionCookie(
  raw: string,
  opts: { remember: boolean; expiresAt: number; now?: number; domain?: string },
): string {
  const parts = [`${SESSION_COOKIE}=${raw}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'];
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.remember) parts.push(`Max-Age=${Math.round((opts.expiresAt - (opts.now ?? Date.now())) / 1000)}`);
  return parts.join('; ');
}

/** Clears the cookie on the same domain it was set on (US-AUTH-16). */
export function clearedSessionCookie(domain?: string): string {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'];
  if (domain) parts.push(`Domain=${domain}`);
  parts.push('Max-Age=0');
  return parts.join('; ');
}

/** Reads one cookie from a Cookie header. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}
