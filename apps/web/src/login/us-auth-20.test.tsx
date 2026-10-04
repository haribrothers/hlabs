// US-AUTH-20 · Understand how to reset a forgotten password (ForgotPassword).
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { ForgotView } from './forgot-view';

describe('US-AUTH-20', () => {
  it('says resets happen at home and lists the three ways, without email or recovery codes', async () => {
    renderScreen(() => <ForgotView />, {});
    expect(await screen.findByRole('heading', { level: 1, name: 'Reset your password' })).toBeInTheDocument();
    expect(screen.getByText("hlabs doesn't use email, so resets happen at home.")).toBeInTheDocument();
    const ways = screen.getByRole('group', { name: 'Ways to reset a password' });
    expect(within(ways).getByText('Ask your admin')).toBeInTheDocument();
    expect(
      within(ways).getByText('Family members: your admin can make a reset link for you from Settings › Users.'),
    ).toBeInTheDocument();
    expect(within(ways).getByText('Admin on a Mac or Linux desktop')).toBeInTheDocument();
    expect(ways).toHaveTextContent(
      "On the computer running hlabs, open the hlabs menu-bar icon and choose Reset a password…. You'll confirm with that computer's own login.",
    );
    expect(within(ways).getByText('Admin on a Linux server')).toBeInTheDocument();
    expect(ways).toHaveTextContent('Connect to the server and run');
    // US-AUTH-21: recovery codes replace two-factor only; they never reset a password.
    expect(screen.queryByText(/recovery code/i)).not.toBeInTheDocument();
  });

  it('shows the command with the known username, or <username>, with a copy button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderScreen(() => <ForgotView user="hari" from="password" />, {});
    expect(await screen.findByText('sudo hlabs reset-password hari')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy command' }));
    expect(writeText).toHaveBeenCalledWith('sudo hlabs reset-password hari');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('uses <username> when no username is known', async () => {
    renderScreen(() => <ForgotView />, {});
    expect(await screen.findByText('sudo hlabs reset-password <username>')).toBeInTheDocument();
  });

  it('"Back to log in" returns to the screen it came from, keeping next', async () => {
    renderScreen(() => <ForgotView from="password" user="hari" next="/settings" />, {});
    const back = await screen.findByRole('link', { name: 'Back to log in' });
    expect(back).toHaveAttribute('href', '/login/password?user=hari&next=%2Fsettings');
  });

  it('from the locked screen goes back there', async () => {
    renderScreen(() => <ForgotView from="locked" user="hari" />, {});
    expect(await screen.findByRole('link', { name: 'Back to log in' })).toHaveAttribute(
      'href',
      '/login/locked?user=hari',
    );
  });
});
