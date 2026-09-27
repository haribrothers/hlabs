import { describe, expect, it } from 'vitest';
import {
  displayNameSchema,
  err,
  formatBytes,
  formatDuration,
  formatPercent,
  helpUrl,
  isFeatureEnabled,
  ok,
  ULID_PATTERN,
  ulid,
  ulidTime,
  unwrap,
  usernameSchema,
} from './index';

describe('ulid', () => {
  it('is 26 Crockford characters and encodes its time', () => {
    const id = ulid(1_700_000_000_000);
    expect(id).toMatch(ULID_PATTERN);
    expect(ulidTime(id)).toBe(1_700_000_000_000);
  });
  it('sorts by creation time', () => {
    expect(ulid(1000) < ulid(2000)).toBe(true);
  });
  it('is unique', () => {
    expect(new Set(Array.from({ length: 1000 }, () => ulid(1))).size).toBe(1000);
  });
});

describe('formatters', () => {
  it.each([
    [0, '0 B'],
    [999, '999 B'],
    [1234, '1.2 KB'],
    [2_500_000_000, '2.5 GB'],
    [250_000_000_000, '250 GB'],
    [999_960, '1 MB'],
    [-1, '—'],
  ])('formatBytes(%d) = %s', (n, s) => expect(formatBytes(n)).toBe(s));

  it.each([
    [500, '500 ms'],
    [90_000, '1 min 30 s'],
    [3_600_000, '1 h'],
    [90_061_000, '1 d 1 h'],
  ])('formatDuration(%d) = %s', (n, s) => expect(formatDuration(n)).toBe(s));

  it('formats percentages', () => expect(formatPercent(0.4567)).toBe('46%'));
});

describe('result', () => {
  it('unwraps ok and throws err', () => {
    expect(unwrap(ok(3))).toBe(3);
    expect(() => unwrap(err(new Error('nope')))).toThrow('nope');
  });
});

describe('schemas', () => {
  it('accepts D-014 usernames only', () => {
    for (const u of ['hari', 'ab-1', 'a23']) expect(usernameSchema.safeParse(u).success).toBe(true);
    for (const u of ['ab', 'Hari', '1abc', 'a_b', 'a'.repeat(33)])
      expect(usernameSchema.safeParse(u).success).toBe(false);
  });
  it('trims display names and limits them to 40 characters (D-044)', () => {
    expect(displayNameSchema.parse('  Hari  ')).toBe('Hari');
    expect(displayNameSchema.safeParse('   ').success).toBe(false);
    expect(displayNameSchema.safeParse('x'.repeat(41)).success).toBe(false);
  });
});

describe('helpUrl', () => {
  it('builds site links and rejects bad slugs', () => {
    expect(helpUrl('backups/restore')).toBe('https://hlabs.dev/help/backups/restore/');
    expect(() => helpUrl('../etc')).toThrow();
  });
});

describe('features', () => {
  it('hides later-phase features', () => {
    expect(isFeatureEnabled('backups', 4)).toBe(false);
    expect(isFeatureEnabled('backups', 5)).toBe(true);
  });
});
