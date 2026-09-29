import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { twoFactorOn } from '../test/account';
import { daemonError, renderScreen } from '../test/render';
import { TwoFactorManage, type AccountData } from './two-factor-manage';

const SETUP = {
  otpauthUrl: 'otpauth://totp/hlabs:hari?secret=JBSWY3DPEHPK3PXP&issuer=hlabs',
  secret: 'JBSWY3DPEHPK3PXP',
};

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

const closed = vi.fn();

async function toCode(handlers: Record<string, (input: unknown) => unknown>) {
  closed.mockClear();
  renderScreen(() => <TwoFactorManage account={twoFactorOn(0)() as unknown as AccountData} onClose={closed} />, {
    'account.totp.begin': () => SETUP,
    'account.get': twoFactorOn(0),
    ...handlers,
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Move to a new phone' }));
  const pw = await screen.findByRole('dialog', { name: 'Move to a new phone' });
  fireEvent.change(within(pw).getByLabelText('Your password'), { target: { value: 'my password' } });
  fireEvent.click(within(pw).getByRole('button', { name: 'Confirm' }));
  return screen.findByRole('dialog', { name: 'Scan with your new phone' });
}

const typeCode = (dialog: HTMLElement, code: string) => {
  for (let i = 0; i < 6; i++)
    fireEvent.change(within(dialog).getByLabelText(`Digit ${i + 1}`), { target: { value: code[i] } });
};

describe('US-ACCT-11', () => {
  it('after the password: a QR code, the key as text and a 6-digit field; the right code moves it', async () => {
    const confirm = vi.fn(() => ({ recoveryCodes: [] }));
    const dialog = await toCode({ 'account.totp.confirm': confirm });
    expect(await within(dialog).findByAltText('QR code for your authenticator app')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: "Can't scan? Enter this key instead" }));
    expect(within(dialog).getByLabelText('Setup key')).toHaveTextContent('JBSW Y3DP EHPK 3PXP');
    typeCode(dialog, '123456');
    await waitFor(() => expect(confirm).toHaveBeenCalledWith({ code: '123456' }));
    await waitFor(() => expect(currentToasts().map((t) => t.title)).toEqual(['Two-factor moved to your new phone']));
    expect(closed).toHaveBeenCalled();
  });

  it('a wrong code says to check the time, and clears the boxes', async () => {
    const dialog = await toCode({ 'account.totp.confirm': () => Promise.reject(daemonError('TOTP_INVALID_CODE')) });
    typeCode(dialog, '000000');
    expect(
      await within(dialog).findByText("That code didn't work. Check the time on your phone and try again."),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Digit 6')).toHaveValue('');
  });

  it('Cancel part-way goes back and changes nothing', async () => {
    const confirm = vi.fn();
    const dialog = await toCode({ 'account.totp.confirm': confirm });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Authenticator app')).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });
});
