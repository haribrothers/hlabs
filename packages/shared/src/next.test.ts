import { describe, expect, it } from 'vitest';
import { nextOrigins, safeNext } from './next';

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

describe('US-AUTH-18', () => {
  const allowed = nextOrigins({
    dashboardUrl: 'https://hlabs.local',
    hostname: 'hlabs',
    apps: [
      { hostname: 'immich', port: 12001 },
      { hostname: 'jellyfin', port: null },
    ],
    tailnet: 'tail1234.ts.net',
  });

  it('allows the dashboard, installed apps, the tailnet name and apps on their tailnet port', () => {
    expect(safeNext('https://immich.hlabs.local/photos', allowed)).toBe('https://immich.hlabs.local/photos');
    expect(safeNext('https://hlabs.local/files', allowed)).toBe('https://hlabs.local/files');
    expect(safeNext('https://jellyfin.hlabs.local/', allowed)).toBe('https://jellyfin.hlabs.local/');
    expect(safeNext('https://hlabs.tail1234.ts.net/settings', allowed)).toBe('https://hlabs.tail1234.ts.net/settings');
    expect(safeNext('https://hlabs.tail1234.ts.net:12001/photos', allowed)).toBe(
      'https://hlabs.tail1234.ts.net:12001/photos',
    );
    expect(safeNext('/files', allowed)).toBe('/files');
  });

  it('ignores everything else', () => {
    for (const bad of [
      'https://evil.com/',
      'https://immich.hlabs.local.evil.com/',
      'https://notinstalled.hlabs.local/',
      'https://hlabs.tail1234.ts.net:12002/',
      'http://immich.hlabs.local/',
      '//evil.com',
      'javascript:alert(1)',
      'https://user:pw@immich.hlabs.local/',
      `https://immich.hlabs.local/${'a'.repeat(2048)}`,
      `/${'a'.repeat(2048)}`,
    ]) {
      expect(safeNext(bad, allowed)).toBe('/');
    }
  });

  it('no tailnet: no tailnet addresses; an http dashboard URL (development) adds nothing', () => {
    const local = nextOrigins({ dashboardUrl: 'http://127.0.0.1:5173', hostname: 'den', apps: [], tailnet: null });
    expect([...local]).toEqual(['https://den.local']);
  });
});
