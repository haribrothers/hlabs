import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { TwoFactorStep } from './two-factor-step';

vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,QR' } }));

const handlers = {
  'auth.me': () => ({ id: 'u1', username: 'hari', totpEnabled: false, csrfToken: 'c' }),
  'system.info': () => ({ hostname: 'homeserver' }),
  'onboarding.setupTotp': () => ({ secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/hlabs:hari' }),
  'onboarding.status': () => ({ completed: false, step: 'storage', hasUsers: true }),
};

describe('US-ONB-13', () => {
  it('Skip for now warns first; Set up now goes back to the QR code', async () => {
    renderScreen(TwoFactorStep, handlers);
    fireEvent.click(await screen.findByRole('button', { name: 'Skip for now' }));
    const dialog = await screen.findByRole('dialog', { name: 'Skip two-factor login?' });
    expect(
      within(dialog).getByText(
        'Anyone who learns your password can manage hlabs. You can turn on two-factor later in Account.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Set up now' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('heading', { level: 1, name: 'Add two-factor login' })).toBeInTheDocument();
  });

  it('Skip saves step storage and opens the storage step', async () => {
    const setStep = vi.fn(() => ({ ok: true }));
    const { router } = renderScreen(TwoFactorStep, { ...handlers, 'onboarding.setStep': setStep });
    fireEvent.click(await screen.findByRole('button', { name: 'Skip for now' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/storage'));
    expect(setStep).toHaveBeenCalledWith({ step: 'storage' });
  });
});
