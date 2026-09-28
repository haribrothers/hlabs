import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeAccount, twoFactorOn } from '../test/account';
import { renderScreen } from '../test/render';
import { Security } from './security';

const rowOf = (title: string) => screen.getByText(title).closest('.hl-list-row') as HTMLElement;

describe('US-ACCT-08', () => {
  it('two-factor on: "On · authenticator app" with Manage, and "<n> of 10 unused" with View', async () => {
    renderScreen(Security, { 'account.get': twoFactorOn(2) });
    await screen.findByText('Two-factor login');
    expect(rowOf('Two-factor login')).toHaveTextContent('On · authenticator app');
    expect(
      within(rowOf('Two-factor login')).getByRole('button', { name: 'Manage two-factor login' }),
    ).toHaveTextContent('Manage');
    expect(rowOf('Recovery codes')).toHaveTextContent('8 of 10 unused');
    expect(within(rowOf('Recovery codes')).getByRole('button', { name: 'View recovery codes' })).toBeInTheDocument();
    expect(screen.queryByText('Running low')).toBeNull();
  });

  it('two-factor off: "Off", and no Recovery codes row', async () => {
    renderScreen(Security, { 'account.get': fakeAccount() });
    await screen.findByText('Two-factor login');
    expect(rowOf('Two-factor login')).toHaveTextContent('Off');
    expect(screen.queryByText('Recovery codes')).toBeNull();
  });

  it('3 or fewer unused codes: "Running low"', async () => {
    renderScreen(Security, { 'account.get': twoFactorOn(7) });
    expect(await screen.findByText('Running low')).toBeInTheDocument();
  });

  it('Manage opens TwoFactorManage; Done closes it and puts focus back on Manage', async () => {
    renderScreen(Security, { 'account.get': twoFactorOn(2, { totpAddedDuringSetup: true }) });
    const manage = await screen.findByRole('button', { name: 'Manage two-factor login' });
    manage.focus();
    fireEvent.click(manage);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Two-factor login')).toBeInTheDocument();
    expect(within(dialog).getByText('On')).toBeInTheDocument();
    expect(within(dialog).getByText('Authenticator app')).toBeInTheDocument();
    expect(within(dialog).getByText('Added when you set up hlabs')).toBeInTheDocument();
    expect(within(dialog).getByText('Recovery codes · 8 of 10 unused')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(manage).toHaveFocus());
  });

  it('two-factor added after setup says when', async () => {
    renderScreen(() => <Security openTwoFactor />, { 'account.get': twoFactorOn(0) });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Added 1 September 2026')).toBeInTheDocument();
  });
});
