// US-SYS-43 · Set up a way to make apps public: Settings › Network's Public access group, PublicSetup (Sign in to
// Cloudflare, waiting, the setup's steps, the API-token fallback), PublicRemove, and Cloudflare in "What hlabs
// connects to".
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderAdvanced } from '../test/advanced';
import { cloudflare, cloudflareOn, job, publicRow, status } from '../test/public';
import { currentToasts, dismissToast } from '../lib/toasts';
import { daemonError, renderScreen, type Handlers } from '../test/render';
import { PublicAccess } from './public-access';

const never = () => new Promise(() => {});
const tab = { location: { href: '' }, close: vi.fn() };
beforeEach(() => {
  tab.location.href = '';
  tab.close.mockClear();
  vi.spyOn(window, 'open').mockReturnValue(tab as never);
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const t of currentToasts()) dismissToast(t.id);
});

function open(handlers: Handlers = {}) {
  return renderScreen(() => <PublicAccess />, {
    'public.status': () => status(),
    'events.stream': never,
    ...handlers,
  });
}

const setupDialog = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Set up Cloudflare Tunnel…' }));
  return screen.findByRole('dialog', { name: /Set up Cloudflare Tunnel/ });
};

describe('US-SYS-43', () => {
  it('the Public access group says what it is for and, until set up, how public apps go out', async () => {
    open();
    const group = await screen.findByRole('group', { name: 'Public access' });
    expect(
      screen.getByText('Make single apps reachable from the internet. Your dashboard never is.'),
    ).toBeInTheDocument();
    expect(within(group).getByText('Cloudflare Tunnel')).toBeInTheDocument();
    expect(
      within(group).getByText(
        'Public apps go through Cloudflare Tunnel, at names under a domain of yours. Your tailnet stays private.',
      ),
    ).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Set up Cloudflare Tunnel…' })).toBeInTheDocument();
  });

  it('PublicSetup says what is needed first, with a help link, and that Cloudflare sees the traffic', async () => {
    open();
    const dialog = await setupDialog();
    expect(within(dialog).getByText('A domain of yours, added to your Cloudflare account')).toBeInTheDocument();
    const help = within(dialog).getByRole('link', { name: /How to add a domain to Cloudflare/ });
    expect(help.getAttribute('href')).toMatch(
      /\/help\/remote-access\/make-an-app-public\/#add-your-domain-to-cloudflare$/,
    );
    expect(help).toHaveAttribute('target', '_blank');
    expect(within(dialog).getByText('Cloudflare will see the traffic to your public apps.')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/kept in this computer's keychain, never in hlabs's database or logs/),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Sign in to Cloudflare/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Use an API token instead' })).toBeInTheDocument();
  });

  it('"Sign in to Cloudflare" opens Cloudflare\'s link in a new tab, then waits with "Open Cloudflare again"', async () => {
    let state = status();
    const { calls } = open({
      'public.status': () => state,
      'public.cloudflareSignIn': () => {
        state = status(cloudflare({ state: 'signingIn', signInUrl: 'https://dash.cloudflare.com/argotunnel?x' }));
        return { url: 'https://dash.cloudflare.com/argotunnel?x' };
      },
      'public.cancelSignIn': () => ({ ok: true }),
    });
    const dialog = await setupDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: /Sign in to Cloudflare/ }));
    await waitFor(() => expect(tab.location.href).toBe('https://dash.cloudflare.com/argotunnel?x'));
    expect(await within(dialog).findByText('Waiting for you in Cloudflare…')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'In the tab that opened, sign in, pick your domain and approve hlabs. This window carries on by itself.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /Open Cloudflare again/ })).toHaveAttribute(
      'href',
      'https://dash.cloudflare.com/argotunnel?x',
    );
    // Cancel stops waiting.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(calls.some((c) => c.path === 'public.cancelSignIn')).toBe(true));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('the setup steps follow the job: signed in, tunnel made, starting the connector; then it closes', async () => {
    let state = status(cloudflare({ state: 'signingIn', signInUrl: 'about:blank#x' }));
    open({
      'public.status': () => state,
      'jobs.get': () => job({ id: 'job1', kind: 'public_setup', state: 'running', message: 'tunnel' }),
    });
    expect(await screen.findByText('Waiting for sign-in…')).toBeInTheDocument();
    const dialog = await setupDialog();
    expect(within(dialog).getByText('Waiting for you in Cloudflare…')).toBeInTheDocument();
    state = status(cloudflare({ state: 'settingUp', jobId: 'job1', domain: 'example.com', credential: 'signIn' }));
    const steps = await within(dialog).findByRole('status', { name: 'Setting up…' }, { timeout: 4000 });
    expect(await within(steps).findByText('Signed in to Cloudflare for example.com')).toBeInTheDocument();
    expect(within(steps).getByText('Tunnel “hlabs” made')).toBeInTheDocument();
    expect(within(steps).getByText('Starting the connector…')).toBeInTheDocument();
    state = status(cloudflareOn());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 4000 });
    expect(currentToasts().some((t) => t.title === 'Cloudflare Tunnel is set up')).toBe(true);
  });

  it('"Use an API token instead" says what the token needs and checks it', async () => {
    const { calls } = open({
      'public.setupCloudflare': (input) => {
        const { token } = input as { token: string };
        if (token !== 'fake-cloudflare-token-0123456789') throw daemonError('CLOUDFLARE_FAILED', { step: 'token' });
        return { jobId: 'job1' };
      },
    });
    const dialog = await setupDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use an API token instead' }));
    expect(within(dialog).getByText(/for this domain only, with:/)).toBeInTheDocument();
    expect(within(dialog).getByText('Zone · DNS · Edit')).toBeInTheDocument();
    expect(within(dialog).getByText('Account · Cloudflare Tunnel · Edit')).toBeInTheDocument();
    // Checked here first.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check and set up' }));
    expect(await within(dialog).findByText('Enter a domain such as example.com')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Domain'), { target: { value: 'example.com' } });
    fireEvent.change(within(dialog).getByLabelText('API token'), { target: { value: 'not-the-right-token-at-all' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check and set up' }));
    expect(await within(dialog).findByText(/Cloudflare didn't accept that token/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('API token'), {
      target: { value: 'fake-cloudflare-token-0123456789' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check and set up' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.path === 'public.setupCloudflare').at(-1)?.input).toEqual({
        domain: 'example.com',
        token: 'fake-cloudflare-token-0123456789',
      }),
    );
    // "Sign in to Cloudflare instead" goes back.
    expect(within(dialog).getByRole('button', { name: 'Sign in to Cloudflare instead' })).toBeInTheDocument();
  });

  it('a setup that did not finish says why and offers it again', async () => {
    open({ 'public.status': () => status(cloudflare({ state: 'error', reason: 'tunnel', jobId: 'job1' })) });
    const dialog = await setupDialog();
    expect(within(dialog).getByRole('alert')).toHaveTextContent("Cloudflare didn't answer");
  });

  it('once set up: the domain, that Cloudflare sees the traffic, Connected and Remove…', async () => {
    open({ 'public.status': () => status(cloudflareOn()) });
    const group = await screen.findByRole('group', { name: 'Public access' });
    expect(within(group).getByText('example.com')).toBeInTheDocument();
    expect(within(group).getByText(/Cloudflare sees the traffic to your public apps/)).toBeInTheDocument();
    expect(within(group).getByText('Connected')).toBeInTheDocument();
    expect(within(group).queryByRole('button', { name: 'Set up Cloudflare Tunnel…' })).toBeNull();
    expect(within(group).getByRole('button', { name: 'Remove…' })).toBeInTheDocument();
  });

  it('a tunnel that stopped working says why', async () => {
    open({ 'public.status': () => status(cloudflareOn({ state: 'error', reason: 'connector' })) });
    expect(await screen.findByText('Not working')).toBeInTheDocument();
    expect(screen.getByText(/Cloudflare Tunnel isn't running/)).toBeInTheDocument();
  });

  it('Remove… lists the public apps made private first, keeps other DNS records, then removes', async () => {
    const { calls } = open({
      'public.status': () => status(cloudflareOn(), [publicRow()]),
      'public.remove': () => ({ jobId: 'job2' }),
      'jobs.get': () => job({ id: 'job2', kind: 'public_remove' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove…' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove Cloudflare Tunnel?' });
    expect(dialog).toHaveTextContent(
      'hlabs makes these apps private first, then deletes the tunnel, the DNS records it made and its Cloudflare sign-in from this computer.',
    );
    expect(within(dialog).getByText('Immich')).toBeInTheDocument();
    expect(within(dialog).getByText('https://photos.example.com')).toBeInTheDocument();
    expect(
      within(dialog).getByText("Your domain's other DNS records, like a website or email, aren't touched."),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make private and remove' }));
    await waitFor(() => expect(calls.some((c) => c.path === 'public.remove')).toBe(true));
    await waitFor(() => expect(currentToasts().some((t) => t.title === 'Cloudflare Tunnel is removed')).toBe(true));
  });

  it('"What hlabs connects to" lists Cloudflare while the tunnel is set up', async () => {
    renderAdvanced({
      'system.connections': () => ({
        connections: [
          {
            id: 'cloudflare',
            kind: 'cloudflare',
            name: 'example.com',
            host: 'api.cloudflare.com',
            state: 'on',
            lastContactAt: null,
          },
        ],
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'View What hlabs connects to' }));
    const dialog = await screen.findByRole('dialog', { name: 'What hlabs connects to' });
    expect(await within(dialog).findByText('example.com')).toBeInTheDocument();
    expect(within(dialog).getByText('api.cloudflare.com')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Carries the apps you make public, through Cloudflare Tunnel · Not contacted yet'),
    ).toBeInTheDocument();
  });
});
