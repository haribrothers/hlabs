// Logging in (US-AUTH-03, US-AUTH-04; 07 §7.2): Argon2id verify (against a dummy hash for unknown accounts, so the
// time is the same), every attempt recorded, 5 failures in 15 minutes per username and IP lock that pair.
import { hlabsError } from '@hlabs/api';
import { auditLog, loginAttempts, users, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { and, eq, gte } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from './passwords';
import type { SessionService } from './sessions';
import type { TotpService } from './totp';

export const LOGIN_LOCK_ATTEMPTS = 5;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;
/** A password step waiting for its two-factor code (US-AUTH-08) lives this long. */
export const CHALLENGE_MS = 5 * 60 * 1000;

export interface LoginChallenge {
  userId: string;
  remember: boolean;
  next?: string;
  expiresAt: number;
}

/** Where to go after logging in: a path on this dashboard, never another site or the log-in page (US-AUTH-18). */
export function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  if (next === '/login' || next.startsWith('/login/') || next.startsWith('/login?')) return '/';
  return next;
}

export class LoginService {
  private dummyHash: Promise<string> | null = null;
  private readonly challenges = new Map<string, LoginChallenge>();

  constructor(
    private readonly db: HlabsDb,
    private readonly sessions: SessionService,
    private readonly totp: TotpService,
  ) {}

  /** Failed attempts for this username (as typed, lowercased) and IP in the last 15 minutes. */
  recentFailures(username: string, ip: string, now = Date.now()): number[] {
    return this.db
      .select({ at: loginAttempts.at })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.username, username),
          eq(loginAttempts.ip, ip),
          eq(loginAttempts.success, false),
          gte(loginAttempts.at, now - LOGIN_LOCK_MS),
        ),
      )
      .all()
      .map((r) => r.at)
      .sort((a, b) => a - b);
  }

  async login(opts: {
    username: string;
    password: string;
    remember: boolean;
    next?: string;
    ip: string;
    userAgent: string | null;
    now?: number;
  }) {
    const now = opts.now ?? Date.now();
    const typed = opts.username;
    const username = typed.trim().toLowerCase();

    const failures = this.recentFailures(username, opts.ip, now);
    if (failures.length >= LOGIN_LOCK_ATTEMPTS) {
      throw hlabsError('AUTH_LOCKED', 'Too many failed logins', {
        until: failures.at(-LOGIN_LOCK_ATTEMPTS)! + LOGIN_LOCK_MS,
      });
    }

    const user = this.db.select().from(users).where(eq(users.username, username)).get();
    this.dummyHash ??= hashPassword(randomBytes(24).toString('base64url'));
    // Always one Argon2id verify, so an unknown or disabled account answers as fast as a wrong password.
    const matches = await verifyPassword(user?.passwordHash ?? (await this.dummyHash), opts.password);
    const ok = matches && user !== undefined && user.disabledAt === null;

    this.db.insert(loginAttempts).values({ id: ulid(), username, ip: opts.ip, at: now, success: ok }).run();
    if (!ok || !user) {
      this.audit(null, 'auth.login.failed', { username: typed }, opts.ip, now);
      if (failures.length + 1 >= LOGIN_LOCK_ATTEMPTS) {
        throw hlabsError('AUTH_LOCKED', 'Too many failed logins', {
          until: [...failures, now].at(-LOGIN_LOCK_ATTEMPTS)! + LOGIN_LOCK_MS,
        });
      }
      throw hlabsError('AUTH_INVALID_CREDENTIALS');
    }

    if (this.totp.isEnabled(user.id)) {
      const challengeId = ulid();
      this.challenges.set(challengeId, {
        userId: user.id,
        remember: opts.remember,
        next: opts.next,
        expiresAt: now + CHALLENGE_MS,
      });
      return { kind: 'totp' as const, challengeId };
    }
    return {
      kind: 'ok' as const,
      ...this.startSession(user.id, opts.remember, opts.next, opts.ip, opts.userAgent, now),
    };
  }

  /** The waiting two-factor step, if it hasn't expired (US-AUTH-08). */
  challenge(id: string, now = Date.now()): LoginChallenge | null {
    const c = this.challenges.get(id);
    if (!c || c.expiresAt <= now) {
      this.challenges.delete(id);
      return null;
    }
    return c;
  }

  /** A new session on every login, so a session id set before logging in is never reused (no fixation). */
  startSession(
    userId: string,
    remember: boolean,
    next: string | undefined,
    ip: string,
    userAgent: string | null,
    now = Date.now(),
  ) {
    const session = this.sessions.create({ userId, remember, ip, userAgent, now });
    this.db.update(users).set({ lastActiveAt: now }).where(eq(users.id, userId)).run();
    this.audit(userId, 'auth.login.succeeded', null, ip, now);
    return { session, redirectTo: safeNext(next) };
  }

  private audit(
    userId: string | null,
    action: string,
    detail: Record<string, unknown> | null,
    ip: string,
    now: number,
  ) {
    this.db
      .insert(auditLog)
      .values({ id: ulid(), at: now, userId, action, target: userId, detailJson: detail, ip })
      .run();
  }
}
