import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { navigationAreas } from '../shell/areas';
import { fakeAccount } from '../test/account';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { AccountSection } from './account-section';
import { visibleSections } from './sections';

function account(role: 'admin' | 'member', adminName: string | null = 'Hari') {
  return renderScreen(AccountSection, {
    'auth.me': fakeMe({ role }),
    'account.get': fakeAccount({ role, adminName }),
    'auth.listSessions': () => ({ items: [] }),
  });
}

describe('US-ACCT-27', () => {
  it('a member reads who manages apps, users and system settings, above their account', async () => {
    account('member');
    expect(await screen.findByText('Apps, users and system settings are managed by Hari (admin).')).toBeInTheDocument();
  });

  it('an admin sees no such note', async () => {
    account('admin');
    await screen.findByRole('button', { name: 'Edit profile' });
    expect(screen.queryByText(/are managed by/)).toBeNull();
  });

  it("a member's sidebar: Account, Appearance, Notifications and About, each when its phase ships", () => {
    expect(visibleSections('member', 3).map((s) => s.id)).toEqual(['account']);
    expect(visibleSections('member', 9).map((s) => s.id)).toEqual(['account', 'appearance', 'notifications', 'about']);
  });

  it("a member's Dock: Home, Files and Settings, plus Usage and the App Store only when allowed", () => {
    const ids = (canSeeUsage: boolean, canInstallApps: boolean) =>
      navigationAreas({ shippedPhase: 9, access: { role: 'member', canSeeUsage, canInstallApps } }).map((a) => a.id);
    expect(ids(false, false)).toEqual(['home', 'files', 'settings']);
    expect(ids(true, false)).toContain('usage');
    expect(ids(false, true)).toContain('store');
  });
});
