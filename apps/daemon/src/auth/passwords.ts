// Password hashing (07 §7.2): Argon2id with m = 64 MiB, t = 3, p = 1.
import { hash, verify, type Algorithm } from '@node-rs/argon2';

/** `Algorithm.Argon2id` is a const enum, which verbatimModuleSyntax can't read; its value is 2. */
const ARGON2ID = 2 as Algorithm;

export const ARGON2_OPTIONS = { algorithm: ARGON2ID, memoryCost: 64 * 1024, timeCost: 3, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password).catch(() => false);
}
