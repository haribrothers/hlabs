import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { TailscaleRow, tailscaleDownload } from './remote-access';

const remote = (o: Record<string, unknown> = {}) => ({
  mode: 'off',
  state: 'off',
  tailnet: null,
  nodeName: null,
  url: null,
  loginUrl: null,
  keyExpiry: null,
  ...o,
});

const tab = { location: { href: '' }, close: vi.fn() };
beforeEach(() => {
  tab.location.href = '';
  tab.close.mockClear();
  vi.spyOn(window, 'open').mockReturnValue(tab as never);
});
afterEach(() => vi.restoreAllMocks());

async function row(
  state: Record<string, unknown>,
  connect: (input: unknown) => unknown = () => ({ state: 'stopped' }),
) {
  const r = renderScreen(() => <TailscaleRow remote={remote(state) as never} />, {
    'network.remote.connect': connect,
    'network.status': () => ({}),
  });
  await screen.findByText('Tailscale');
  return r;
}

describe('US-SYS-02', () => {
  it('not installed: "Not installed" and Get Tailscale (the official installer), no Connect', async () => {
    await row({ state: 'not_installed' });
    expect(screen.getByText('Not installed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get Tailscale' })).toHaveAttribute('href', tailscaleDownload());
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
    expect(tailscaleDownload('MacIntel')).toBe('https://tailscale.com/download/mac');
    expect(tailscaleDownload('Linux x86_64')).toBe('https://tailscale.com/download/linux');
  });

  it('Connect while signed out opens the log-in page in a new tab', async () => {
    const { calls } = await row({}, () => ({ state: 'needs_login', loginUrl: 'https://login.tailscale.com/a/x' }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(tab.location.href).toBe('https://login.tailscale.com/a/x'));
    expect(calls.find((c) => c.path === 'network.remote.connect')?.input).toEqual({});
  });

  it('waiting: "Waiting for sign-in…" with a link back to the log-in page', async () => {
    await row({ state: 'waiting', loginUrl: 'https://login.tailscale.com/a/x' });
    expect(screen.getByText('Waiting for sign-in…')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the Tailscale log-in page' })).toHaveAttribute(
      'href',
      'https://login.tailscale.com/a/x',
    );
  });

  it('timed out: "Sign-in timed out. Try again." with Connect', async () => {
    await row({ state: 'timed_out' });
    expect(screen.getByText('Sign-in timed out. Try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });

  it('connected: the tailnet address, "Connected", and a link on adding family (D-108)', async () => {
    await row({
      state: 'connected',
      mode: 'tailscale',
      url: 'https://hari-home.tail9.ts.net',
      tailnet: 'tail9.ts.net',
    });
    expect(screen.getByText('hari-home.tail9.ts.net')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Adding family to your tailnet')).toBeInTheDocument();
  });

  it('warns when the Tailscale key expires within 14 days', async () => {
    await row({ state: 'connected', url: 'https://h.t.ts.net', keyExpiry: Date.now() + 3 * 86_400_000 });
    expect(screen.getByRole('status')).toHaveTextContent(/Tailscale will sign this computer out on/);
  });

  it('already signed in: asks to publish on that tailnet first, then connects with confirmTailnet', async () => {
    const { calls } = await row({}, (input) =>
      (input as { confirmTailnet?: boolean })?.confirmTailnet
        ? { state: 'connected', url: 'https://hari-home.tail9.ts.net' }
        : { state: 'confirm', tailnet: 'tail9.ts.net', nodeName: 'hari-home' },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publish hlabs on tail9.ts.net?' });
    expect(dialog).toHaveTextContent('https://hari-home.tail9.ts.net');
    expect(tab.close).toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(calls.at(-1)?.input).toEqual({ confirmTailnet: true }));
  });

  it('port 443 served already: offers port 8443 for the dashboard (D-103)', async () => {
    const { calls } = await row({}, (input) => {
      if ((input as { dashboardPort?: number })?.dashboardPort === 8443)
        return { state: 'connected', url: 'https://h.t.ts.net:8443' };
      throw daemonError('TAILSCALE_SERVE_CONFLICT', { port: 443 });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    const dialog = await screen.findByRole('dialog', { name: 'Port 443 is already served on your tailnet' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use port 8443 for the dashboard' }));
    await waitFor(() => expect(calls.at(-1)?.input).toEqual({ confirmTailnet: true, dashboardPort: 8443 }));
  });

  it('Linux without the operator setting: shows the command with Copy and Try again (D-104)', async () => {
    await row({}, () => {
      throw daemonError('TAILSCALE_PERMISSION_DENIED');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('sudo tailscale set --operator=hlabs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
