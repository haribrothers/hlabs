import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeAccount } from '../test/account';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { AccountSection } from './account-section';
import { profileLine } from './profile';

describe('US-ACCT-28', () => {
  it('"<username> · Member · 4.2 GB in Home folder" once Files ships; "Calculating…" while it is counted', () => {
    const anu = { username: 'anu', role: 'member' as const, homeFolderBytes: 4_200_000_000 };
    expect(profileLine(anu, true)).toBe('anu · Member · 4.2 GB in Home folder');
    expect(profileLine({ ...anu, homeFolderBytes: null }, true)).toBe('anu · Member · Calculating…');
    // Hidden until Files ships (phase 5, D-036).
    expect(profileLine(anu, false)).toBe('anu · Member');
  });

  it('a member has the same Security group and devices, and their password reads "Set when you joined hlabs"', async () => {
    renderScreen(AccountSection, {
      'auth.me': fakeMe({ role: 'member', username: 'anu' }),
      'account.get': fakeAccount({ role: 'member', username: 'anu', displayName: 'Anu', passwordChangedAt: null }),
      'auth.listSessions': () => ({ items: [] }),
    });
    expect(await screen.findByText('anu · Member')).toBeInTheDocument();
    expect(screen.getByText('Set when you joined hlabs')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Security' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });
});
