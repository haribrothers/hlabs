import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/passwords';

describe('password hashing (07 §7.2)', () => {
  it('uses Argon2id with m=64 MiB, t=3, p=1 and verifies only the right password', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(stored).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(await verifyPassword(stored, 'correct horse battery')).toBe(true);
    expect(await verifyPassword(stored, 'correct horse battery!')).toBe(false);
    expect(await verifyPassword('not a hash', 'x')).toBe(false);
  });
});
