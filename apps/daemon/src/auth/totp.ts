// Two-factor login (07 §7.2): TOTP per RFC 6238 (SHA-1, 6 digits, 30 s, ±1 step) and 10 single-use recovery
// codes `xxxx-xxxx`, stored as Argon2id hashes. Secrets live in the secret store, never in SQLite.
import { hlabsError } from '@hlabs/api';
import { auditLog, recoveryCodes, users, userTotp, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { generateSecret, generateURI, verifySync } from 'otplib';
import type { SecretStore } from '../platform/secrets';
import { hashPassword } from './passwords';

export const TOTP_ISSUER = 'hlabs';
export const RECOVERY_CODE_COUNT = 10;
/** 5 wrong codes in 15 minutes lock confirmation for 15 minutes (07 §7.2, same numbers as login). */
export const LOCK_ATTEMPTS = 5;
export const LOCK_WINDOW_MS = 15 * 60 * 1000;
/** A secret shown for setup waits this long to be confirmed (US-ACCT-11). */
export const PENDING_MS = 10 * 60 * 1000;

/** No 0/o, 1/l/i: easy to read back from paper. */
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export const totpSecretRef = (userId: string) => `totp:${userId}`;

/** The 30-second step the code belongs to (current ±1), or null. `after` refuses that step and earlier (replay). */
export function totpCodeStep(secret: string, code: string, opts: { now?: number; after?: number } = {}): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const result = verifySync({
    secret,
    token: code,
    epoch: Math.floor((opts.now ?? Date.now()) / 1000),
    epochTolerance: 30,
    ...(opts.after !== undefined ? { afterTimeStep: opts.after } : {}),
  });
  // The union also covers HOTP results, which have no timeStep.
  return result.valid && 'timeStep' in result ? result.timeStep : null;
}

export function verifyTotpCode(secret: string, code: string, now = Date.now()): boolean {
  return totpCodeStep(secret, code, { now }) !== null;
}

export function newRecoveryCode(): string {
  const part = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `${part()}-${part()}`;
}

/** 10 new codes and their Argon2id hashes, one at a time (each hash takes 64 MiB). */
export async function makeRecoveryCodes(): Promise<{ codes: string[]; hashes: string[] }> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
  const hashes: string[] = [];
  for (const c of codes) hashes.push(await hashPassword(c));
  return { codes, hashes };
}

export class TotpService {
  /**
   * Secrets shown but not yet confirmed, by user; a new setup replaces the old one (US-ONB-11). They're kept 10
   * minutes (US-ACCT-11); cancelling just leaves one to expire.
   */
  private readonly pending = new Map<string, { secret: string; at: number }>();
  private readonly failures = new Map<string, number[]>();
  /** The last step accepted at log-in, per user: the same code can't be used twice (US-AUTH-08). */
  private readonly lastStep = new Map<string, number>();

  constructor(
    private readonly db: HlabsDb,
    private readonly secrets: SecretStore,
  ) {}

  isEnabled(userId: string): boolean {
    return this.db.select().from(userTotp).where(eq(userTotp.userId, userId)).get()?.enabledAt != null;
  }

  /** A new pending secret. `move`: two-factor is on and this replaces it on confirm (US-ACCT-11). */
  begin(userId: string, opts: { move?: boolean; now?: number } = {}): { secret: string; otpauthUrl: string } {
    if (this.isEnabled(userId) !== (opts.move ?? false)) {
      throw hlabsError('VALIDATION_FAILED', opts.move ? 'Two-factor is off' : 'Two-factor is already on');
    }
    const user = this.db.select({ username: users.username }).from(users).where(eq(users.id, userId)).get();
    if (!user) throw hlabsError('NOT_FOUND');
    const secret = generateSecret();
    this.pending.set(userId, { secret, at: opts.now ?? Date.now() });
    return { secret, otpauthUrl: generateURI({ issuer: TOTP_ISSUER, label: user.username, secret }) };
  }

  /**
   * Checks a code at log-in (US-AUTH-08, US-AUTH-11). A secret that can't be read from the secret store is
   * AUTH_SECRET_UNAVAILABLE, which the caller doesn't count as a failed attempt.
   */
  async verifyLogin(userId: string, code: string, now = Date.now()): Promise<boolean> {
    const secret = await this.secrets.get(totpSecretRef(userId)).catch(() => null);
    if (!secret) throw hlabsError('AUTH_SECRET_UNAVAILABLE');
    const step = totpCodeStep(secret, code, { now, after: this.lastStep.get(userId) });
    if (step === null) return false;
    this.lastStep.set(userId, step);
    return true;
  }

  /**
   * New recovery codes (US-ACCT-10): the old ones are deleted and the new ones stored in one transaction, so the old
   * codes stop working at once. Two-factor must be on.
   */
  async regenerateRecoveryCodes(userId: string, opts: { ip: string | null; now?: number }): Promise<string[]> {
    if (!this.isEnabled(userId)) throw hlabsError('VALIDATION_FAILED', 'Two-factor is off');
    const { codes, hashes } = await makeRecoveryCodes();
    const now = opts.now ?? Date.now();
    this.db.transaction((tx) => {
      tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId)).run();
      for (const codeHash of hashes) tx.insert(recoveryCodes).values({ id: ulid(), userId, codeHash }).run();
      tx.insert(auditLog)
        .values({
          id: ulid(),
          at: now,
          userId,
          action: 'account.recoveryCodes.regenerate',
          target: userId,
          detailJson: null,
          ip: opts.ip,
        })
        .run();
    });
    return codes;
  }

  discard(userId: string): void {
    this.pending.delete(userId);
  }

  /** Checks the code against the pending secret; on success turns two-factor on and returns new recovery codes. */
  /**
   * Checks the code against the pending secret. Turning two-factor on: stores it and returns 10 new recovery codes.
   * Moving to a new phone (already on): swaps the secret, keeps the recovery codes and returns none; codes from the
   * old app stop working.
   */
  async confirm(userId: string, code: string, opts: { ip: string | null; now?: number }): Promise<string[]> {
    const now = opts.now ?? Date.now();
    const recent = (this.failures.get(userId) ?? []).filter((t) => now - t < LOCK_WINDOW_MS);
    if (recent.length >= LOCK_ATTEMPTS) {
      throw hlabsError('AUTH_LOCKED', 'Too many wrong codes', { until: recent[0]! + LOCK_WINDOW_MS });
    }
    const pending = this.pending.get(userId);
    if (!pending || now - pending.at > PENDING_MS) {
      this.pending.delete(userId);
      throw hlabsError('VALIDATION_FAILED', 'Start two-factor setup first');
    }
    const { secret } = pending;
    if (!verifyTotpCode(secret, code, now)) {
      this.failures.set(userId, [...recent, now]);
      throw hlabsError('TOTP_INVALID_CODE');
    }

    const secretRef = totpSecretRef(userId);
    if (this.isEnabled(userId)) {
      await this.secrets.set(secretRef, secret);
      this.db.transaction((tx) => {
        tx.update(userTotp).set({ secretRef, enabledAt: now }).where(eq(userTotp.userId, userId)).run();
        tx.insert(auditLog)
          .values({ id: ulid(), at: now, userId, action: 'totp.move', target: userId, detailJson: null, ip: opts.ip })
          .run();
      });
      this.pending.delete(userId);
      this.failures.delete(userId);
      this.lastStep.delete(userId);
      return [];
    }
    const { codes, hashes } = await makeRecoveryCodes();
    await this.secrets.set(secretRef, secret);
    this.db.transaction((tx) => {
      tx.insert(userTotp)
        .values({ userId, secretRef, enabledAt: now })
        .onConflictDoUpdate({ target: userTotp.userId, set: { secretRef, enabledAt: now } })
        .run();
      tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId)).run();
      for (const codeHash of hashes) tx.insert(recoveryCodes).values({ id: ulid(), userId, codeHash }).run();
      tx.insert(auditLog)
        .values({ id: ulid(), at: now, userId, action: 'totp.enable', target: userId, detailJson: null, ip: opts.ip })
        .run();
    });
    this.pending.delete(userId);
    this.failures.delete(userId);
    return codes;
  }
}
