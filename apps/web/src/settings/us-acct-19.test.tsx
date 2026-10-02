import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { LoginScreenPolicy } from './people-policy';

const POLICY = { showUserList: true, requireTotp: false, membersCanInstall: false, membersCanSeeUsage: false };

describe('US-ACCT-19', () => {
  it('"Require two-factor for everyone": members set it up the next time they log in', async () => {
    const { calls } = renderScreen(LoginScreenPolicy, {
      'users.getPolicy': () => POLICY,
      'users.updatePolicy': (input) => ({ ...POLICY, ...(input as object) }),
    });
    expect(await screen.findByText('Members set it up the next time they log in')).toBeInTheDocument();
    const sw = screen.getByRole('switch', { name: 'Require two-factor for everyone' });
    await waitFor(() => expect(sw).toBeEnabled());
    fireEvent.click(sw);
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'users.updatePolicy')?.input).toEqual({ requireTotp: true }),
    );
  });

  it('without my own two-factor: the switch stays off and a dialog sends me to set it up', async () => {
    const { router } = renderScreen(LoginScreenPolicy, {
      'users.getPolicy': () => POLICY,
      'users.updatePolicy': () => {
        throw daemonError('TOTP_REQUIRED_SELF_FIRST');
      },
    });
    const sw = await screen.findByRole('switch', { name: 'Require two-factor for everyone' });
    await waitFor(() => expect(sw).toBeEnabled());
    fireEvent.click(sw);
    expect(
      await screen.findByRole('dialog', { name: 'Turn on two-factor for your own account first.' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'));
    expect(screen.queryByText("Couldn't save that setting. Try again.")).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Set up two-factor' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/account/two-factor'));
  });
});
