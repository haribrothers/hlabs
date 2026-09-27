import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { RECOVERY_FILE_NAME, recoveryCodesText } from './recovery-codes';
import { TwoFactorStep } from './two-factor-step';

vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,QR' } }));

const CODES = Array.from({ length: 10 }, (_, i) => `abcd-e${'fghjkmnpqr'[i]}23`);
const me = (totpEnabled: boolean) => () => ({ id: 'u1', username: 'hari', totpEnabled, csrfToken: 'c' });
const base = {
  'system.info': () => ({ hostname: 'homeserver' }),
  'onboarding.setupTotp': () => ({ secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/hlabs:hari' }),
  'onboarding.confirmTotp': () => ({ recoveryCodes: CODES }),
  'onboarding.status': () => ({ completed: false, step: 'storage', hasUsers: true }),
};

async function turnOn() {
  await waitFor(() => expect(screen.getByLabelText('Digit 1')).toBeEnabled());
  '481259'
    .split('')
    .forEach((d, i) => fireEvent.change(screen.getByLabelText(`Digit ${i + 1}`), { target: { value: d } }));
  return screen.findByRole('list', { name: 'Recovery codes' });
}

describe('US-ONB-12', () => {
  it('the downloaded file has the server, username, date and the 10 codes', () => {
    const text = recoveryCodesText({
      hostname: 'homeserver',
      username: 'hari',
      date: new Date('2026-09-28T10:00:00Z'),
      codes: CODES,
    });
    expect(text).toContain('Server: homeserver');
    expect(text).toContain('Username: hari');
    expect(text).toContain('Created: 2026-09-28');
    for (const code of CODES) expect(text).toContain(code);
  });

  it('shows 10 codes with the warning, Download, Copy and Continue', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    const createObjectURL = vi.fn(() => 'blob:codes');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe(RECOVERY_FILE_NAME);
    });
    renderScreen(TwoFactorStep, { ...base, 'auth.me': me(false) });

    const list = await turnOn();
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(CODES);
    expect(
      screen.getByText("Save these somewhere safe. Each code works once and you won't see them again."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(click).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy' })));
    expect(writeText).toHaveBeenCalledWith(CODES.join('\n'));
    click.mockRestore();
  });

  it('Continue saves step storage and opens the storage step', async () => {
    const setStep = vi.fn(() => ({ ok: true }));
    const { router } = renderScreen(TwoFactorStep, { ...base, 'auth.me': me(false), 'onboarding.setStep': setStep });
    await turnOn();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/storage'));
    expect(setStep).toHaveBeenCalledWith({ step: 'storage' });
  });

  it('after a reload the codes are not shown again: "Two-factor is on" and Continue', async () => {
    const setupTotp = vi.fn();
    renderScreen(TwoFactorStep, { ...base, 'auth.me': me(true), 'onboarding.setupTotp': setupTotp });
    expect(await screen.findByRole('heading', { level: 1, name: 'Two-factor is on' })).toBeInTheDocument();
    expect(screen.getByText('You can make new recovery codes later in Account settings.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Recovery codes' })).toBeNull();
    expect(setupTotp).not.toHaveBeenCalled();
  });
});
