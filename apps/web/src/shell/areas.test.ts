import { describe, expect, it } from 'vitest';
import { areaForPath, navigationAreas, phoneAreas } from './areas';

describe('shell areas', () => {
  it('lists the six areas in the fixed Dock order once every phase has shipped (D-054)', () => {
    expect(navigationAreas({ shippedPhase: 9 }).map((a) => a.label)).toEqual([
      'Home',
      'App Store',
      'Files',
      'Usage',
      'Backups',
      'Settings',
    ]);
  });

  it('gives phones five tabs, the App Store named as on the Dock (US-PHONE-01, D-172)', () => {
    expect(phoneAreas({ shippedPhase: 9 }).map((a) => a.label)).toEqual([
      'Home',
      'App Store',
      'Files',
      'Usage',
      'Settings',
    ]);
  });

  it('maps paths to their area', () => {
    expect(areaForPath('/')).toBe('home');
    expect(areaForPath('/store/immich')).toBe('store');
    expect(areaForPath('/settings/account')).toBe('settings');
    expect(areaForPath('/unknown')).toBe('home');
  });
});
