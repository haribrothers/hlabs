import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { groupKey, TwoFactorStep } from './two-factor-step';

vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,QR' } }));

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const setup = () => ({ secret: SECRET, otpauthUrl: `otpauth://totp/hlabs:hari?secret=${SECRET}&issuer=hlabs` });
const digit = (n: number) => screen.getByLabelText(`Digit ${n}`);
const type = (code: string) =>
  code.split('').forEach((d, i) => fireEvent.change(digit(i + 1), { target: { value: d } }));

describe('US-ONB-11', () => {
  it('shows the heading with Recommended, the QR code, the key on request and the app hint', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    renderScreen(TwoFactorStep, { 'onboarding.setupTotp': setup });
    expect(await screen.findByRole('heading', { level: 1, name: 'Add two-factor login' })).toBeInTheDocument();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(
      screen.getByText('Scan with an authenticator app, then enter the 6-digit code it shows.'),
    ).toBeInTheDocument();
    expect(await screen.findByAltText('QR code for your authenticator app')).toHaveAttribute(
      'src',
      'data:image/png;base64,QR',
    );
    expect(
      screen.getByText('Works with any TOTP app, such as 1Password, Google Authenticator or Authy.'),
    ).toBeInTheDocument();

    expect(screen.queryByText(groupKey(SECRET))).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: "Can't scan? Enter this key instead" }));
    expect(screen.getByText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')).toHaveClass('font-mono');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy key' })));
    expect(writeText).toHaveBeenCalledWith(SECRET);
  });

  it('Turn on waits for six digits; the sixth digit checks the code', async () => {
    const confirmTotp = vi.fn(() => new Promise(() => {}));
    renderScreen(TwoFactorStep, { 'onboarding.setupTotp': setup, 'onboarding.confirmTotp': confirmTotp });
    await waitFor(() => expect(digit(1)).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeDisabled();
    type('48125');
    expect(confirmTotp).not.toHaveBeenCalled();
    type('481259');
    await waitFor(() => expect(confirmTotp).toHaveBeenCalledWith({ code: '481259' }));
  });

  it('a wrong code clears the fields, focuses Digit 1 and says what to check', async () => {
    renderScreen(TwoFactorStep, {
      'onboarding.setupTotp': setup,
      'onboarding.confirmTotp': () => Promise.reject(daemonError('TOTP_INVALID_CODE')),
    });
    await waitFor(() => expect(digit(1)).toBeEnabled());
    type('000000');
    expect(
      await screen.findByText("That code didn't work. Check the time on your phone and try again."),
    ).toBeInTheDocument();
    for (let n = 1; n <= 6; n++) expect(digit(n)).toHaveValue('');
    await waitFor(() => expect(digit(1)).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeDisabled();
  });

  it('the right code turns two-factor on and shows the recovery codes', async () => {
    const codes = Array.from({ length: 10 }, (_, i) => `abcd-ef${String(i).padStart(2, '2')}`);
    renderScreen(TwoFactorStep, {
      'onboarding.setupTotp': setup,
      'onboarding.confirmTotp': () => ({ recoveryCodes: codes }),
    });
    await waitFor(() => expect(digit(1)).toBeEnabled());
    type('481259');
    expect(await screen.findByRole('heading', { level: 1, name: 'Two-factor is on' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Recovery codes' })).getAllByRole('listitem')).toHaveLength(10);
  });
});
