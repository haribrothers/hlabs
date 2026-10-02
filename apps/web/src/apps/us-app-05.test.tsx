// US-APP-05 · App address and tailnet address.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { appDetail } from '../test/store';
import { AppAccess } from './app-access';
import { AppSettings } from './app-settings';

const never = () => new Promise(() => {});
const vaultwarden = (tailnet: string | null = null, local = 'https://vaultwarden.hlabs.local') =>
  appDetail({ id: 'vaultwarden', name: 'Vaultwarden', state: 'running', urls: { local, tailnet, port: null } });
const TAILNET = 'https://hlabs.tail1234.ts.net:14003';

afterEach(() => {
  vi.restoreAllMocks();
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-APP-05', () => {
  it('App settings shows the app address as a link that opens in a new tab, with Copy', async () => {
    renderScreen(
      () => <AppSettings appId="vaultwarden" />,
      { 'apps.get': () => vaultwarden(), 'events.stream': never, 'auth.me': fakeMe({ role: 'admin' }) },
      { path: '/apps/vaultwarden/settings' },
    );
    const access = await screen.findByRole('group', { name: 'Access' });
    const link = within(access).getByRole('link', { name: 'https://vaultwarden.hlabs.local' });
    expect(link).toHaveAttribute('href', 'https://vaultwarden.hlabs.local');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(within(access).getByRole('button', { name: 'Copy https://vaultwarden.hlabs.local' })).toHaveTextContent(
      'Copy',
    );
  });

  it('Copy copies the address and says "Address copied"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AppAccess app={vaultwarden()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy https://vaultwarden.hlabs.local' }));
    expect(writeText).toHaveBeenCalledWith('https://vaultwarden.hlabs.local');
    await waitFor(() =>
      expect(currentToasts()).toContainEqual(expect.objectContaining({ tone: 'success', title: 'Address copied' })),
    );
  });

  it('with remote access on (phase 3 shipped), "Also on your tailnet" shows its tailnet address with Copy', () => {
    render(<AppAccess app={vaultwarden(TAILNET)} shippedPhase={3} />);
    expect(screen.getByText('Also on your tailnet')).toBeInTheDocument();
    expect(screen.getByText(TAILNET)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Copy ${TAILNET}` })).toBeInTheDocument();
  });

  it('the tailnet row is hidden while remote access is off', () => {
    render(<AppAccess app={vaultwarden(null)} shippedPhase={3} />);
    expect(screen.queryByText('Also on your tailnet')).toBeNull();
  });

  it('the tailnet row is hidden until phase 3 ships, even with a tailnet address (D-036)', () => {
    render(<AppAccess app={vaultwarden(TAILNET)} shippedPhase={2} />);
    expect(screen.queryByText('Also on your tailnet')).toBeNull();
  });

  it("an app whose name can't be published shows its fallback address", () => {
    render(<AppAccess app={vaultwarden(null, 'https://hlabs.local:12003')} />);
    expect(screen.getByRole('link', { name: 'https://hlabs.local:12003' })).toHaveAttribute(
      'href',
      'https://hlabs.local:12003',
    );
  });
});
