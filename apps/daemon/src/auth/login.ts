// Logging in (US-AUTH-03, US-AUTH-04; 07 §7.2): Argon2id verify (against a dummy hash for unknown accounts, so the
// time is the same), every attempt recorded. 5 failed passwords or codes in 15 minutes for a username and IP lock that
// pair for 15 minutes (US-AUTH-12); a completed log-in starts the count again.
import { hlabsError } from '@hlabs/api';
import { auditLog, loginAttempts, recoveryCodes, users, type HlabsDb } from '@hlabs/db';
import { safeNext, ulid } from '@hlabs/shared';
import { and, asc, eq, gte, isNull, lt } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { createNotification } from '../notifications/service';
import type { EventBus } from '../events/bus';
import { hashPassword, verifyPassword } from './passwords';
import { normaliseRecoveryCode } from './recovery-code';
import type { SessionService } from './sessions';
import type { TotpService } from './totp';

export { normaliseRecoveryCode, safeNext };

export const LOGIN_LOCK_ATTEMPTS = 5;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;
/** `login_attempts` rows are kept this long (US-AUTH-12). */
export const LOGIN_ATTEMPTS_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
/** A password step waiting for its two-factor code (US-AUTH-08) lives this long. */
export const CHALLENGE_MS = 5 * 60 * 1000;

export interface LockState {
  /** When the current lock ends, or null. */
  lockedUntil: number | null;
  /** Failures that count toward the next lock: in the last 15 minutes, since the last log-in and the last lock. */
  failures: number[];
}

/**
 * Where a username and IP stand, from their attempts in the last 30 minutes (oldest first): a lock that is still on
 * started in the last 15 minutes, and its failures in the 15 minutes before that.
 */
export function lockState(attempts: Array<{ at: number; success: boolean }>, now: number): LockState {
  let window: number[] = [];
  let lockedUntil: number | null = null;
  for (const a of attempts) {
    if (a.success || (lockedUntil !== null && a.at >= lockedUntil)) {
      window = [];
      lockedUntil = null;
      if (a.success) continue;
    }
    window = window.filter((t) => a.at - t < LOGIN_LOCK_MS);
    window.push(a.at);
    if (window.length >= LOGIN_LOCK_ATTEMPTS) lockedUntil = a.at + LOGIN_LOCK_MS;
  }
  if (lockedUntil !== null && lockedUntil <= now) return { lockedUntil: null, failures: [] };
  return { lockedUntil, failures: window.filter((t) => now - t < LOGIN_LOCK_MS) };
}

const lockedError = (until: number, now: number) =>
  hlabsError('AUTH_LOCKED', 'Too many failed logins', {
    retryAfterSeconds: Math.max(1, Math.ceil((until - now) / 1000)),
  });

export interface LoginChallenge {
  userId: string;
  remember: boolean;
  next?: string;
  expiresAt: number;
}

export class LoginService {
  private dummyHash: Promise<string> | null = null;
  private readonly challenges = new Map<string, LoginChallenge>();

  constructor(
    private readonly db: HlabsDb,
    private readonly sessions: SessionService,
    private readonly totp: TotpService,
    private readonly bus: EventBus,
    /** Where `next` may point besides dashboard paths (US-AUTH-18). */
    private readonly nextOrigins: () => ReadonlySet<string> = () => new Set(),
  ) {}

  /** The lock state for this username (trimmed, lowercased) and IP. */
  lockState(username: string, ip: string, now = Date.now()): LockState {
    const attempts = this.db
      .select({ at: loginAttempts.at, success: loginAttempts.success })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.username, username),
          eq(loginAttempts.ip, ip),
          gte(loginAttempts.at, now - 2 * LOGIN_LOCK_MS),
        ),
      )
      .orderBy(asc(loginAttempts.at))
      .all();
    return lockState(attempts, now);
  }

  /**
   * A signed-in person confirming their current password (change password, recovery codes, two-factor:
   * US-ACCT-07). It shares the log-in lockout for their username and this IP: while locked it's AUTH_LOCKED without
   * checking; a wrong password is AUTH_INVALID_PASSWORD, and the fifth in 15 minutes locks (and notifies admins).
   */
  async confirmPassword(opts: {
    user: { id: string; username: string; passwordHash: string };
    password: string;
    action: string;
    ip: string;
    now?: number;
  }): Promise<void> {
    const now = opts.now ?? Date.now();
    const { user, ip } = opts;
    const failures = this.assertNotLocked(user.username, ip, now);
    if (await verifyPassword(user.passwordHash, opts.password)) return;
    this.recordFailure({
      userId: user.id,
      username: user.username,
      detail: { username: user.username, step: opts.action },
      failures,
      ip,
      now,
    });
    throw hlabsError('AUTH_INVALID_PASSWORD');
  }

  /** While locked, nothing is checked and nothing is recorded, so the lock isn't extended. */
  private assertNotLocked(username: string, ip: string, now: number): number[] {
    const state = this.lockState(username, ip, now);
    if (state.lockedUntil !== null) throw lockedError(state.lockedUntil, now);
    return state.failures;
  }

  /** A wrong password or code: recorded and audited; the fifth in 15 minutes starts a lock. */
  private recordFailure(opts: {
    userId: string | null;
    username: string;
    detail: Record<string, unknown>;
    failures: number[];
    ip: string;
    now: number;
  }) {
    const { username, ip, now } = opts;
    this.db.insert(loginAttempts).values({ id: ulid(), username, ip, at: now, success: false }).run();
    this.audit(opts.userId, 'auth.login.failed', opts.detail, ip, now);
    if (opts.failures.length + 1 >= LOGIN_LOCK_ATTEMPTS) {
      // A lock starts (US-AUTH-13): audited, and every admin is told once (D-045).
      this.audit(opts.userId, 'auth.locked', { username, ip }, ip, now);
      this.notify({
        userId: null,
        kind: 'auth.locked',
        title: 'Repeated failed logins',
        body: `${LOGIN_LOCK_ATTEMPTS} failed logins for @${username} from ${ip}. Logging in as @${username} is paused for 15 minutes.`,
        now,
      });
      throw lockedError(now + LOGIN_LOCK_MS, now);
    }
  }

  /** Drops attempts older than 30 days; runs at start and once a day. */
  pruneAttempts(now = Date.now()): number {
    return this.db
      .delete(loginAttempts)
      .where(lt(loginAttempts.at, now - LOGIN_ATTEMPTS_KEEP_MS))
      .run().changes;
  }

  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  startPruning(): void {
    this.pruneAttempts();
    this.pruneTimer = setInterval(() => this.pruneAttempts(), 24 * 60 * 60 * 1000);
    this.pruneTimer.unref();
  }

  stop(): void {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.pruneTimer = null;
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

    const failures = this.assertNotLocked(username, opts.ip, now);

    const user = this.db.select().from(users).where(eq(users.username, username)).get();
    this.dummyHash ??= hashPassword(randomBytes(24).toString('base64url'));
    // Always one Argon2id verify, so an unknown or disabled account answers as fast as a wrong password.
    const matches = await verifyPassword(user?.passwordHash ?? (await this.dummyHash), opts.password);
    if (!matches || !user || user.disabledAt !== null) {
      this.recordFailure({ userId: null, username, detail: { username: typed }, failures, ip: opts.ip, now });
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
    this.notify({
      userId: user.id,
      kind: 'auth.recovery_code',
      title: 'Recovery code used',
      body: `Someone logged in as @${user.username} with a recovery code. ${left} left. If this wasn't you, change your password.`,
      now,
    });
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
    const failures = this.assertNotLocked(user.username, ip, now);
    return { challenge, user, failures };
  }

  /** A wrong code counts like a wrong password (US-AUTH-12). */
  private secondStepFailed(
    user: { id: string; username: string },
    failures: number[],
    step: 'totp' | 'recovery_code',
    ip: string,
    now: number,
  ) {
    this.recordFailure({
      userId: user.id,
      username: user.username,
      detail: { username: user.username, step },
      failures,
      ip,
      now,
    });
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
    const user = this.db.update(users).set({ lastActiveAt: now }).where(eq(users.id, userId)).returning().get();
    // A completed log-in (not just the password of a two-factor account) starts the count again.
    if (user)
      this.db.insert(loginAttempts).values({ id: ulid(), username: user.username, ip, at: now, success: true }).run();
    this.audit(userId, 'auth.login.succeeded', null, ip, now);
    return { session, redirectTo: safeNext(next, this.nextOrigins()) };
  }

  /** A warning notification for one user, or for all admins (`userId` null), announced on the bus. */
  private notify(n: { userId: string | null; kind: string; title: string; body: string; now: number }) {
    createNotification(this.db, this.bus, { ...n, severity: 'warning' });
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
