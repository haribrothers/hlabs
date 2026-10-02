import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { AppsAccessDialog } from './apps-access-dialog';

const anu = {
  id: 'u2',
  username: 'anu',
  displayName: 'Anu',
  role: 'member',
  avatarColor: null,
  appIds: [],
  canSeeShared: true,
  canSeeUsage: false,
};

function open() {
  const onClose = vi.fn();
  const r = renderScreen(() => <AppsAccessDialog userId="u2" onClose={onClose} />, {
    'users.get': () => anu,
    'apps.list': () => ({ apps: [] }),
    'users.setAppAccess': () => ({ ok: true }),
    'users.list': () => ({ users: [] }),
  });
  return { ...r, onClose };
}

describe('US-ACCT-25', () => {
  it('below the apps: "See the Shared folder in Files" (Home folders stay private) and "See live usage"', async () => {
    open();
    expect(await screen.findByRole('switch', { name: 'See the Shared folder in Files' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText('Their own Home folder is always private')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'See live usage' })).toHaveAttribute('aria-checked', 'false');
  });

  it('Save sends them with the app access, in one request', async () => {
    const { calls, onClose } = open();
    fireEvent.click(await screen.findByRole('switch', { name: 'See the Shared folder in Files' }));
    fireEvent.click(screen.getByRole('switch', { name: 'See live usage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const saves = calls.filter((c) => c.path === 'users.setAppAccess');
    expect(saves).toEqual([
      { path: 'users.setAppAccess', input: { userId: 'u2', appIds: [], canSeeShared: false, canSeeUsage: true } },
    ]);
  });
});
