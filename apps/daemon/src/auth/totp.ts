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

/** No 0/o, 1/l/i: easy to read back from paper. */
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export const totpSecretRef = (userId: string) => `totp:${userId}`;

export function verifyTotpCode(secret: string, code: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  return verifySync({ secret, token: code, epoch: Math.floor(now / 1000), epochTolerance: 30 }).valid;
}

export function newRecoveryCode(): string {
  const part = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `${part()}-${part()}`;
}

export class TotpService {
  /** Secrets shown but not yet confirmed, by user; a new setup replaces the old one (US-ONB-11). */
  private readonly pending = new Map<string, string>();
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly db: HlabsDb,
    private readonly secrets: SecretStore,
  ) {}

  isEnabled(userId: string): boolean {
    return this.db.select().from(userTotp).where(eq(userTotp.userId, userId)).get()?.enabledAt != null;
  }

  begin(userId: string): { secret: string; otpauthUrl: string } {
    if (this.isEnabled(userId)) throw hlabsError('VALIDATION_FAILED', 'Two-factor is already on');
    const user = this.db.select({ username: users.username }).from(users).where(eq(users.id, userId)).get();
    if (!user) throw hlabsError('NOT_FOUND');
    const secret = generateSecret();
    this.pending.set(userId, secret);
    return { secret, otpauthUrl: generateURI({ issuer: TOTP_ISSUER, label: user.username, secret }) };
  }

  discard(userId: string): void {
    this.pending.delete(userId);
  }

  /** Checks the code against the pending secret; on success turns two-factor on and returns new recovery codes. */
  async confirm(userId: string, code: string, opts: { ip: string | null; now?: number }): Promise<string[]> {
    const now = opts.now ?? Date.now();
    const recent = (this.failures.get(userId) ?? []).filter((t) => now - t < LOCK_WINDOW_MS);
    if (recent.length >= LOCK_ATTEMPTS) {
      throw hlabsError('AUTH_LOCKED', 'Too many wrong codes', { until: recent[0]! + LOCK_WINDOW_MS });
    }
    const secret = this.pending.get(userId);
    if (!secret) throw hlabsError('VALIDATION_FAILED', 'Start two-factor setup first');
    if (!verifyTotpCode(secret, code, now)) {
      this.failures.set(userId, [...recent, now]);
      throw hlabsError('TOTP_INVALID_CODE');
    }

    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
    // One at a time: each Argon2id hash takes 64 MiB.
    const hashes: string[] = [];
    for (const c of codes) hashes.push(await hashPassword(c));
    const secretRef = totpSecretRef(userId);
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
