import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { fakeAccount, twoFactorOn } from '../test/account';
import { daemonError, renderScreen } from '../test/render';
import { Security } from './security';
import { TwoFactorManage, type AccountData } from './two-factor-manage';

const SETUP = {
  otpauthUrl: 'otpauth://totp/hlabs:hari?secret=JBSWY3DPEHPK3PXP&issuer=hlabs',
  secret: 'JBSWY3DPEHPK3PXP',
};
const CODES = Array.from({ length: 10 }, (_, i) => `new${i}-code`);

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-ACCT-12', () => {
  it('Turn on: password, pair the app, then the 10 new recovery codes', async () => {
    let on = false;
    renderScreen(Security, {
      'account.get': () => (on ? twoFactorOn(0)() : fakeAccount()()),
      'account.totp.begin': () => SETUP,
      'account.totp.confirm': () => {
        on = true;
        return { recoveryCodes: CODES };
      },
      'auth.me': () => ({}),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on two-factor login' }));
    const pw = await screen.findByRole('dialog', { name: 'Turn on two-factor login' });
    fireEvent.change(within(pw).getByLabelText('Your password'), { target: { value: 'my password' } });
    fireEvent.click(within(pw).getByRole('button', { name: 'Confirm' }));
    const scan = await screen.findByRole('dialog', { name: 'Scan with your phone' });
    for (let i = 0; i < 6; i++)
      fireEvent.change(within(scan).getByLabelText(`Digit ${i + 1}`), { target: { value: '1' } });
    const list = await screen.findByRole('list', { name: 'Recovery codes' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(CODES);
  });

  it('Turn off warns, asks for the password and a code, then closes and says so', async () => {
    const disable = vi.fn(() => ({ ok: true }));
    const closed = vi.fn();
    renderScreen(() => <TwoFactorManage account={twoFactorOn(0)() as unknown as AccountData} onClose={closed} />, {
      'account.totp.disable': disable,
      'account.get': fakeAccount(),
      'auth.listSessions': () => ({ items: [] }),
      'auth.me': () => ({}),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Turn off two-factor…' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Turn off two-factor login?' });
    expect(within(dialog).getByText('Anyone with your password will be able to log in.')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'my password' } });
    fireEvent.change(within(dialog).getByLabelText('6-digit code or recovery code'), {
      target: { value: 'abcd-2345' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn off' }));
    await waitFor(() => expect(closed).toHaveBeenCalled());
    expect(disable).toHaveBeenCalledWith({ password: 'my password', code: 'abcd-2345' });
    expect(currentToasts().map((t) => t.title)).toEqual([
      'Two-factor login is off. Your other devices are signed out.',
    ]);
  });

  it('a wrong code says so on the code field', async () => {
    renderScreen(() => <TwoFactorManage account={twoFactorOn(0)() as unknown as AccountData} onClose={() => {}} />, {
      'account.totp.disable': () => Promise.reject(daemonError('TOTP_INVALID_CODE')),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Turn off two-factor…' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'my password' } });
    fireEvent.change(within(dialog).getByLabelText('6-digit code or recovery code'), { target: { value: '000000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn off' }));
    expect(await within(dialog).findByText(/That code didn't work/)).toBeInTheDocument();
  });

  it('when an admin requires two-factor, Turn off is disabled and says why', async () => {
    renderScreen(
      () => (
        <TwoFactorManage
          account={twoFactorOn(0, { totpRequired: true })() as unknown as AccountData}
          onClose={() => {}}
        />
      ),
      {},
    );
    const button = await screen.findByRole('button', { name: 'Turn off two-factor…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Your admin requires two-factor login.');
  });
});
