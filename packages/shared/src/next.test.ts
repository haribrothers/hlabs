import { describe, expect, it } from 'vitest';
import { safeNext } from './next';

describe('safeNext (US-AUTH-05, US-AUTH-18)', () => {
  it('keeps paths on this dashboard and refuses anything else', () => {
    expect(safeNext('/files?path=%2Fphotos')).toBe('/files?path=%2Fphotos');
    expect(safeNext('https://evil.example/')).toBe('/');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('/\\evil.example')).toBe('/');
    expect(safeNext('/login/users')).toBe('/');
    expect(safeNext('')).toBe('/');
    expect(safeNext(undefined)).toBe('/');
  });
});
