import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { twoFactorOn } from '../test/account';
import { daemonError, renderScreen } from '../test/render';
import { TwoFactorManage, type AccountData } from './two-factor-manage';

const NEW = Array.from({ length: 10 }, (_, i) => `new${i}-code`);

async function openNewCodes(regenerate: (input: unknown) => unknown) {
  renderScreen(() => <TwoFactorManage account={twoFactorOn(4)() as unknown as AccountData} onClose={() => {}} />, {
    'account.recoveryCodes.regenerate': regenerate,
    'account.get': twoFactorOn(0),
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Make new codes' }));
  const dialog = await screen.findByRole('dialog', { name: 'Make new codes' });
  expect(within(dialog).getByText('Your old codes will stop working.')).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'my password' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Make new codes' }));
  return dialog;
}

describe('US-ACCT-10', () => {
  it('asks for the password, then shows the 10 new codes in plain text with Download enabled', async () => {
    const regenerate = vi.fn(() => ({ recoveryCodes: NEW }));
    await openNewCodes(regenerate);
    const list = await screen.findByRole('list', { name: 'Recovery codes' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(NEW);
    expect(regenerate).toHaveBeenCalledWith({ password: 'my password' });
    expect(screen.getByText('Recovery codes · 10 of 10 unused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled();
  });

  it('a wrong password says "That\'s not your password" and keeps the old codes', async () => {
    const dialog = await openNewCodes(() => Promise.reject(daemonError('AUTH_INVALID_PASSWORD')));
    expect(await within(dialog).findByText("That's not your password")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    const list = await screen.findByRole('list', { name: 'Recovery codes' });
    expect(within(list).getAllByRole('listitem')[5]).toHaveTextContent('••••-••••');
  });
});
