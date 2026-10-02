// Phase 2 feedback (D-097): Trust hlabs on this device — the certificate to download and steps for this device.
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
import { deviceOs, TrustDevice } from './trust-device';

describe('Trust hlabs on this device (D-097)', () => {
  it('picks the device from the browser', () => {
    expect(deviceOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('mac');
    expect(deviceOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', true)).toBe('ios');
    expect(deviceOs('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios');
    expect(deviceOs('Mozilla/5.0 (Linux; Android 15; Pixel 9)')).toBe('android');
    expect(deviceOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(deviceOs('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
  });

  it("offers the certificate and this device's steps; another device's steps are one choice away", async () => {
    renderScreen(TrustDevice, {});
    expect(await screen.findByRole('heading', { level: 1, name: 'Trust hlabs on this device' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download certificate' })).toHaveAttribute('href', '/ca.crt');
    fireEvent.click(screen.getByRole('radio', { name: 'Windows' }));
    const steps = screen.getByRole('list', { name: 'Windows' });
    expect(within(steps).getAllByRole('listitem')).toHaveLength(3);
    expect(within(steps).getByText(/Trusted Root Certification Authorities/)).toBeInTheDocument();
  });
});
