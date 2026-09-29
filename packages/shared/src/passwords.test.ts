import { describe, expect, it } from 'vitest';
import { passwordIssue } from './passwords';

describe('password rule (07 §7.2)', () => {
  it('needs at least 12 characters', () => {
    expect(passwordIssue('')).toBe('tooShort');
    expect(passwordIssue('abcdefghijk')).toBe('tooShort');
    expect(passwordIssue('correct horse')).toBeNull();
  });

  it('refuses common passwords, whatever their case', () => {
    expect(passwordIssue('q1w2e3r4t5y6')).toBe('tooCommon');
    expect(passwordIssue('1QAZ2WSX3EDC')).toBe('tooCommon');
  });

  it('counts characters, not bytes', () => {
    expect(passwordIssue('ñandú-ñandú!')).toBeNull();
  });
});
