import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { RemoteStep } from './remote-step';
import { fakeDns } from '../test/network';

const tab = { location: { href: '' }, close: vi.fn() };
beforeEach(() => {
  tab.location.href = '';
  tab.close.mockClear();
  vi.spyOn(window, 'open').mockReturnValue(tab as never);
});
afterEach(() => vi.restoreAllMocks());

const home = {
  hostname: 'hlabs',
  localAddress: 'https://hlabs.local',
  dnsAddress: '',
  published: true,
  lanAddresses: [],
  fallbackAddress: null,
};
const remote = (o: Record<string, unknown>) => ({
  mode: 'tailscale',
  state: 'off',
  tailnet: null,
  nodeName: null,
  url: null,
  loginUrl: null,
  keyExpiry: null,
  ...o,
});

function step(connect: (input: unknown) => unknown, after: Record<string, unknown> = {}) {
  return renderScreen(
    () => <RemoteStep shippedPhase={3} />,
    {
      'system.info': () => ({ hostname: 'hlabs', os: { headless: false } }),
      'onboarding.connectRemote': connect,
      'network.status': () => ({ home, remote: remote(after), dns: fakeDns(), ports: { https: 443, http: 80 } }),
      'onboarding.setStep': () => ({ ok: true }),
      'onboarding.status': () => ({ completed: false, step: 'apps', hasUsers: true }),
    },
    { path: '/setup/remote' },
  );
}

describe('US-ONB-17', () => {
  it('shows the home network as Ready and Tailscale with Connect', async () => {
    step(() => ({ state: 'stopped' }));
    expect(await screen.findByText('Anywhere, with Tailscale')).toBeInTheDocument();
    expect(screen.getByText('Private HTTPS address on your tailnet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set up later' })).toBeInTheDocument();
  });

  it('not installed: the download page opens in a new tab and the row says to install first', async () => {
    step(() => ({ state: 'not_installed' }), { state: 'not_installed' });
    fireEvent.click(await screen.findByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(tab.location.href).toMatch(/^https:\/\/tailscale\.com\/download\//));
    expect(await screen.findByText('Install Tailscale, then press Connect again.')).toBeInTheDocument();
  });

  it('signed out: the log-in page opens, the row waits for the log-in', async () => {
    const { calls } = step(() => ({ state: 'needs_login', loginUrl: 'https://login.tailscale.com/a/x' }), {
      state: 'waiting',
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(tab.location.href).toBe('https://login.tailscale.com/a/x'));
    expect(await screen.findByText('Waiting for you to log in…')).toBeInTheDocument();
    expect(calls.some((c) => c.path === 'onboarding.connectRemote')).toBe(true);
  });

  it('connected: the tailnet address, an example app address, and Continue instead of Set up later', async () => {
    const { router } = step(() => ({ state: 'connected', url: 'https://hlabs.tail1234.ts.net' }), {
      state: 'connected',
      url: 'https://hlabs.tail1234.ts.net',
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('hlabs.tail1234.ts.net')).toBeInTheDocument();
    expect(screen.getByText('After connecting, apps open at')).toBeInTheDocument();
    expect(screen.getByText('https://hlabs.tail1234.ts.net:12001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set up later' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/apps'));
  });

  it('already signed in: asks to confirm the tailnet first', async () => {
    step((input) =>
      (input as { confirmTailnet?: boolean })?.confirmTailnet
        ? { state: 'connected', url: 'https://hari-home.tail9.ts.net' }
        : { state: 'confirm', tailnet: 'tail9.ts.net', nodeName: 'hari-home' },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Connect' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publish hlabs on tail9.ts.net?' });
    expect(within(dialog).getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });
});

describe('US-ONB-17 · the finish screen', () => {
  it('names the tailnet address when remote access was connected (read as saved, without asking Tailscale)', async () => {
    const { DoneStep } = await import('./done-step');
    const { fakeMe } = await import('../test/me');
    const { calls } = renderScreen(() => <DoneStep shippedPhase={3} />, {
      'auth.me': fakeMe(),
      'system.info': () => ({ hostname: 'hlabs', os: { headless: false } }),
      'storage.locations.list': () => ({ locations: [{ id: 'l', isRoot: true, name: 'This computer' }] }),
      'apps.list': () => ({ apps: [] }),
      'network.status': () => ({
        home,
        remote: remote({ state: 'connected', url: 'https://hlabs.tail1234.ts.net' }),
        dns: fakeDns(),
        ports: { https: 443, http: 80 },
      }),
    });
    expect(await screen.findByText('hlabs.tail1234.ts.net')).toBeInTheDocument();
    expect(calls.find((c) => c.path === 'network.status')?.input).toEqual({ probe: false });
  });
});
