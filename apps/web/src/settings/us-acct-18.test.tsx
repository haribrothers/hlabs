import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toaster } from '../shell/toaster';
import { daemonError, renderScreen } from '../test/render';
import { LoginScreenPolicy } from './people-policy';

const POLICY = { showUserList: true, requireTotp: false, membersCanInstall: false, membersCanSeeUsage: false };

function open(update: (input: unknown) => unknown) {
  return renderScreen(
    () => (
      <>
        <LoginScreenPolicy />
        <Toaster />
      </>
    ),
    { 'users.getPolicy': () => POLICY, 'users.updatePolicy': update },
  );
}

describe('US-ACCT-18', () => {
  it('"Show the list of users", with what turning it off means', async () => {
    open(() => POLICY);
    expect(await screen.findByRole('group', { name: 'Log-in screen' })).toBeInTheDocument();
    expect(
      screen.getByText('Off: everyone types a username. Recommended when hlabs is reachable over Tailscale.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Show the list of users' })).toHaveAttribute('aria-checked', 'true'),
    );
  });

  it('saves as soon as it is turned off', async () => {
    const { calls } = open((input) => ({ ...POLICY, ...(input as object) }));
    const sw = await screen.findByRole('switch', { name: 'Show the list of users' });
    await waitFor(() => expect(sw).toBeEnabled());
    fireEvent.click(sw);
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'users.updatePolicy')?.input).toEqual({ showUserList: false }),
    );
  });

  it('puts the switch back and says so when saving fails', async () => {
    open(() => {
      throw daemonError('INTERNAL');
    });
    const sw = await screen.findByRole('switch', { name: 'Show the list of users' });
    await waitFor(() => expect(sw).toBeEnabled());
    fireEvent.click(sw);
    expect(await screen.findByText("Couldn't save that setting. Try again.")).toBeInTheDocument();
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));
  });
});
