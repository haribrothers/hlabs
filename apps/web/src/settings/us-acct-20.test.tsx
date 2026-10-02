import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { AppsAccessDialog } from './apps-access-dialog';
import { MembersPolicy } from './people-policy';

const POLICY = { showUserList: true, requireTotp: false, membersCanInstall: false, membersCanSeeUsage: false };

describe('US-ACCT-20', () => {
  it('"What members can do": install (otherwise they only open apps you share) and live usage, both off', async () => {
    const { calls } = renderScreen(MembersPolicy, {
      'users.getPolicy': () => POLICY,
      'users.updatePolicy': (input) => ({ ...POLICY, ...(input as object) }),
    });
    expect(await screen.findByRole('group', { name: 'What members can do' })).toBeInTheDocument();
    expect(screen.getByText('Otherwise they can only open apps you share')).toBeInTheDocument();
    const install = screen.getByRole('switch', { name: 'Install apps from the App Store' });
    await waitFor(() => expect(install).toBeEnabled());
    expect(install).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'See live usage' })).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(install);
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'users.updatePolicy')?.input).toEqual({ membersCanInstall: true }),
    );
  });

  it("with live usage off for members, a member's own switch is disabled and says why", async () => {
    renderScreen(() => <AppsAccessDialog userId="u2" onClose={vi.fn()} />, {
      'users.get': () => ({
        id: 'u2',
        username: 'anu',
        displayName: 'Anu',
        role: 'member',
        avatarColor: null,
        appIds: [],
        canSeeShared: false,
        canSeeUsage: true,
        homeFolderBytes: 0,
      }),
      'apps.list': () => ({ apps: [] }),
      'users.getPolicy': () => POLICY,
    });
    expect(await screen.findByText('Turned off for all members in Users')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'See live usage' })).toBeDisabled();
  });
});
