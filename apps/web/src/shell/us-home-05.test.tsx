import { Dock, TabBar, UiStringsProvider } from '@hlabs/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { uiStrings } from '../copy/shell';
import { navigationAreas, phoneAreas, storeBadge, type NavAccess } from './areas';

const admin: NavAccess = { role: 'admin', canSeeUsage: true, canInstallApps: true };
const member = (canSeeUsage = false, canInstallApps = false): NavAccess => ({
  role: 'member',
  canSeeUsage,
  canInstallApps,
});

describe('US-HOME-05', () => {
  it('the App Store count shows the real number, "9+" above nine, and nothing for 0', () => {
    const { rerender } = render(
      <UiStringsProvider strings={uiStrings}>
        <Dock areas={navigationAreas({ shippedPhase: 9 })} badges={{ store: 2 }} search={false} />
      </UiStringsProvider>,
    );
    expect(screen.getByRole('button', { name: 'App Store, 2 updates' })).toHaveTextContent('2');
    rerender(
      <UiStringsProvider strings={uiStrings}>
        <Dock areas={navigationAreas({ shippedPhase: 9 })} badges={{ store: 12 }} search={false} />
      </UiStringsProvider>,
    );
    const store = screen.getByRole('button', { name: 'App Store, 12 updates' });
    expect(store.querySelector('.hl-dock-badge')).toHaveTextContent('9+');
    rerender(
      <UiStringsProvider strings={uiStrings}>
        <Dock areas={navigationAreas({ shippedPhase: 9 })} badges={{}} search={false} />
      </UiStringsProvider>,
    );
    expect(screen.getByRole('button', { name: 'App Store' }).querySelector('.hl-dock-badge')).toBeNull();
  });

  it('the phone App Store tab shows the same badge', () => {
    const items = phoneAreas({ shippedPhase: 9 }).map((a) => (a.id === 'store' ? { ...a, badge: 12 } : a));
    render(
      <UiStringsProvider strings={uiStrings}>
        <TabBar items={items} />
      </UiStringsProvider>,
    );
    expect(screen.getByLabelText('12 updates')).toHaveTextContent('9+');
  });

  it('the badge is for admins, from phase 7 (updates list), never 0', () => {
    expect(storeBadge(2, { access: admin, shippedPhase: 1 })).toBeUndefined();
    expect(storeBadge(2, { access: admin, shippedPhase: 7 })).toBe(2);
    expect(storeBadge(0, { access: admin, shippedPhase: 7 })).toBeUndefined();
    expect(storeBadge(2, { access: member(true, true), shippedPhase: 7 })).toBeUndefined();
  });

  it('members see Home, Files and Settings, plus Usage and App Store only when allowed', () => {
    const labels = (access: NavAccess) => navigationAreas({ access, shippedPhase: 9 }).map((a) => a.label);
    expect(labels(member())).toEqual(['Home', 'Files', 'Settings']);
    expect(labels(member(true))).toEqual(['Home', 'Files', 'Usage', 'Settings']);
    expect(labels(member(false, true))).toEqual(['Home', 'App Store', 'Files', 'Settings']);
    expect(labels(admin)).toEqual(['Home', 'App Store', 'Files', 'Usage', 'Backups', 'Settings']);
    // Phase gating still applies.
    expect(navigationAreas({ access: member(true, true), shippedPhase: 1 }).map((a) => a.label)).toEqual([
      'Home',
      'Settings',
    ]);
  });
});
