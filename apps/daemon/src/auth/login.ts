// Logging in (US-AUTH-03, US-AUTH-04; 07 §7.2): Argon2id verify (against a dummy hash for unknown accounts, so the
// time is the same), every attempt recorded, 5 failures in 15 minutes per username and IP lock that pair.
import { hlabsError } from '@hlabs/api';
import { auditLog, loginAttempts, notifications, recoveryCodes, users, type HlabsDb } from '@hlabs/db';
import { safeNext, ulid } from '@hlabs/shared';
import { and, eq, gte, isNull } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { EventBus } from '../events/bus';
import { hashPassword, verifyPassword } from './passwords';
import type { SessionService } from './sessions';
import type { TotpService } from './totp';

export { safeNext };

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

/** `ABCD 2345`, `abcd2345` and `abcd-2345` are the same code; anything else can't match. */
export function normaliseRecoveryCode(input: string): string | null {
  const bare = input.toLowerCase().replace(/[\s-]/g, '');
  return /^[a-z0-9]{8}$/.test(bare) ? `${bare.slice(0, 4)}-${bare.slice(4)}` : null;
}

export class LoginService {
  private dummyHash: Promise<string> | null = null;
  private readonly challenges = new Map<string, LoginChallenge>();

  constructor(
    private readonly db: HlabsDb,
    private readonly sessions: SessionService,
    private readonly totp: TotpService,
    private readonly bus: EventBus,
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

  /**
   * The code step of a log-in (US-AUTH-08): the challenge must be under 5 minutes old; a wrong code counts toward
   * the lockout like a wrong password; the right one starts the session.
   */
  async verifyTotp(opts: { challengeId: string; code: string; ip: string; userAgent: string | null; now?: number }) {
    const now = opts.now ?? Date.now();
    const { user, challenge, failures } = this.secondStep(opts.challengeId, opts.ip, now);
    let right: boolean;
    try {
      right = await this.totp.verifyLogin(user.id, opts.code, now);
    } catch (err) {
      // The secret can't be read (US-AUTH-11): logged, and not the person's fault, so it doesn't count.
      this.audit(user.id, 'auth.totp.secret_unavailable', null, opts.ip, now);
      throw err;
    }
    if (!right) {
      this.secondStepFailed(user, failures, 'totp', opts.ip, now);
      throw hlabsError('AUTH_TOTP_INVALID');
    }
    this.challenges.delete(opts.challengeId);
    return this.startSession(user.id, challenge.remember, challenge.next, opts.ip, opts.userAgent, now);
  }

  /**
   * A recovery code instead of the 6-digit code (US-AUTH-09): typed with or without the dash, in any case. A match
   * is used up (only one of two tabs using it at once wins), audited, and the user gets a warning notification.
   */
  async useRecoveryCode(opts: {
    challengeId: string;
    code: string;
    ip: string;
    userAgent: string | null;
    now?: number;
  }) {
    const now = opts.now ?? Date.now();
    const { user, challenge, failures } = this.secondStep(opts.challengeId, opts.ip, now);
    const code = normaliseRecoveryCode(opts.code);
    const unused = this.db
      .select()
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.userId, user.id), isNull(recoveryCodes.usedAt)))
      .all();
    let matched: string | null = null;
    if (code) {
      // One Argon2id verify per unused code; they're hashed, so there's nothing to look up.
      for (const row of unused) {
        if (await verifyPassword(row.codeHash, code)) {
          matched = row.id;
          break;
        }
      }
    }
    const used =
      matched !== null &&
      this.db
        .update(recoveryCodes)
        .set({ usedAt: now })
        .where(and(eq(recoveryCodes.id, matched), isNull(recoveryCodes.usedAt)))
        .run().changes === 1;
    if (!used) {
      this.secondStepFailed(user, failures, 'recovery_code', opts.ip, now);
      throw hlabsError('AUTH_RECOVERY_INVALID');
    }

    this.challenges.delete(opts.challengeId);
    const left = unused.length - 1;
    this.audit(user.id, 'auth.login.recovery_code', { left }, opts.ip, now);
    const notificationId = ulid();
    const title = 'Recovery code used';
    this.db
      .insert(notifications)
      .values({
        id: notificationId,
        userId: user.id,
        kind: 'auth.recovery_code',
        severity: 'warning',
        title,
        body: `Someone logged in as @${user.username} with a recovery code. ${left} left. If this wasn't you, change your password.`,
        actionJson: null,
        createdAt: now,
        readAt: null,
      })
      .run();
    this.bus.emit(
      'notification.created',
      { notificationId, severity: 'warning', title },
      { kind: 'user', userId: user.id },
    );
    return {
      ...this.startSession(user.id, challenge.remember, challenge.next, opts.ip, opts.userAgent, now),
      recoveryCodesLeft: left,
    };
  }

  /** The waiting challenge and its user, unless it expired or the pair is locked. */
  private secondStep(challengeId: string, ip: string, now: number) {
    const challenge = this.challenge(challengeId, now);
    if (!challenge) throw hlabsError('AUTH_CHALLENGE_EXPIRED');
    const user = this.db.select().from(users).where(eq(users.id, challenge.userId)).get();
    if (!user || user.disabledAt !== null) {
      this.challenges.delete(challengeId);
      throw hlabsError('AUTH_CHALLENGE_EXPIRED');
    }
    const failures = this.recentFailures(user.username, ip, now);
    if (failures.length >= LOGIN_LOCK_ATTEMPTS) {
      throw hlabsError('AUTH_LOCKED', 'Too many failed logins', {
        until: failures.at(-LOGIN_LOCK_ATTEMPTS)! + LOGIN_LOCK_MS,
      });
    }
    return { challenge, user, failures };
  }

  /** A wrong code counts like a wrong password; the fifth one locks. */
  private secondStepFailed(
    user: { id: string; username: string },
    failures: number[],
    step: 'totp' | 'recovery_code',
    ip: string,
    now: number,
  ) {
    this.db.insert(loginAttempts).values({ id: ulid(), username: user.username, ip, at: now, success: false }).run();
    this.audit(user.id, 'auth.login.failed', { username: user.username, step }, ip, now);
    if (failures.length + 1 >= LOGIN_LOCK_ATTEMPTS) {
      throw hlabsError('AUTH_LOCKED', 'Too many failed logins', {
        until: [...failures, now].at(-LOGIN_LOCK_ATTEMPTS)! + LOGIN_LOCK_MS,
      });
    }
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
