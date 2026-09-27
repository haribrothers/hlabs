import { describe, expect, it } from 'vitest';
import { areaForPath, navigationAreas, phoneAreas } from './areas';

describe('shell areas', () => {
  it('lists the six areas in the fixed Dock order (D-054)', () => {
    expect(navigationAreas().map((a) => a.label)).toEqual([
      'Home',
      'App Store',
      'Files',
      'Usage',
      'Backups',
      'Settings',
    ]);
  });

  it('gives phones five tabs with "Apps" for the App Store (US-PHONE-01)', () => {
    expect(phoneAreas().map((a) => a.label)).toEqual(['Home', 'Apps', 'Files', 'Usage', 'Settings']);
  });

  it('maps paths to their area', () => {
    expect(areaForPath('/')).toBe('home');
    expect(areaForPath('/store/immich')).toBe('store');
    expect(areaForPath('/settings/account')).toBe('settings');
    expect(areaForPath('/unknown')).toBe('home');
  });
});
