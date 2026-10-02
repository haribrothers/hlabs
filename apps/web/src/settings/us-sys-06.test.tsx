import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeDns } from '../test/network';
import { daemonError, renderScreen, renderWithDaemon, type Handlers } from '../test/render';
import { DnsServerDialog, DnsServerRows, dnsProblem, recordLines } from './dns-server';

const RECORDS = [
  { name: 'hlabs.home.arpa', type: 'A' as const, value: '192.168.1.20' },
  { name: 'immich.hlabs.home.arpa', type: 'A' as const, value: '192.168.1.20' },
];

function open(dns = fakeDns(), handlers: Handlers = {}) {
  return renderScreen(() => <DnsServerDialog dns={dns} onClose={vi.fn()} />, {
    'network.setDnsServer': () => ({ ok: true }),
    'network.testDnsServer': () => ({ ok: true }),
    'network.status': () => ({}),
    ...handlers,
  });
}

const choose = async (name: string) => fireEvent.click(await screen.findByRole('radio', { name: new RegExp(name) }));

describe('US-SYS-06', () => {
  it('offers None (chosen), AdGuard Home, Pi-hole and another DNS server, with the helper', async () => {
    open();
    const group = await screen.findByRole('radiogroup', { name: 'Local DNS server' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual([
      'None',
      'AdGuard Home on this computerInstall AdGuard Home from the App Store to use this',
      'Pi-holeOn this computer or another device, such as a Raspberry Pi',
      'Another DNS serverYou add the records yourself',
    ]);
    expect(within(group).getByRole('radio', { name: /None/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText("Point your router's DNS at it so every device uses it.")).toBeInTheDocument();
  });

  it("AdGuard Home that isn't installed is disabled, with a link to it in the App Store", async () => {
    open();
    expect(await screen.findByRole('radio', { name: /AdGuard Home/ })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Get AdGuard Home' })).toHaveAttribute('href', '/store/app/adguard-home');
  });

  it('arrow keys skip AdGuard Home while it is disabled', async () => {
    open();
    const group = await screen.findByRole('radiogroup', { name: 'Local DNS server' });
    fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect(within(group).getByRole('radio', { name: /Pi-hole/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('AdGuard Home when installed saves with kind adguard', async () => {
    const { calls } = open(fakeDns({ adguardInstalled: true }));
    await choose('AdGuard Home');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'network.setDnsServer')?.input).toEqual({ kind: 'adguard' }),
    );
  });

  it('Pi-hole: Test checks the address and password and says so inline; Save sends them', async () => {
    const { calls } = open();
    await choose('Pi-hole');
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(screen.getByText('Enter an address that starts with http:// or https://')).toBeInTheDocument();
    expect(screen.getByText('Enter an app password')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Pi-hole address'), { target: { value: 'http://192.168.1.10' } });
    fireEvent.change(screen.getByLabelText('App password'), { target: { value: 'app-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(await screen.findByText('Pi-hole answered and accepted the password')).toBeInTheDocument();
    expect(calls.find((c) => c.path === 'network.testDnsServer')?.input).toEqual({
      address: 'http://192.168.1.10',
      appPassword: 'app-pass',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'network.setDnsServer')?.input).toEqual({
        kind: 'pihole',
        address: 'http://192.168.1.10',
        appPassword: 'app-pass',
      }),
    );
  });

  it('a refused password shows inline', async () => {
    open(fakeDns(), {
      'network.testDnsServer': () => {
        throw daemonError('DNS_SERVER_AUTH_FAILED');
      },
    });
    await choose('Pi-hole');
    fireEvent.change(screen.getByLabelText('Pi-hole address'), { target: { value: 'http://pi.lan' } });
    fireEvent.change(screen.getByLabelText('App password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Pi-hole refused the app password/);
  });

  it('the same Pi-hole again keeps the saved password', async () => {
    const { calls } = open(fakeDns({ kind: 'pihole', address: 'http://pi.lan' }));
    expect(await screen.findByText('Leave empty to keep the saved password')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'network.setDnsServer')?.input).toEqual({
        kind: 'pihole',
        address: 'http://pi.lan',
      }),
    );
  });

  it('another DNS server lists the records with Copy, and says they follow the LAN address', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    renderWithDaemon(<DnsServerRows dns={fakeDns({ kind: 'manual', records: RECORDS })} />);
    expect(screen.getByText('hlabs.home.arpa · A · 192.168.1.20')).toBeInTheDocument();
    expect(screen.getByText("They change if this computer's address on your network changes.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy records' }));
    expect(writeText).toHaveBeenCalledWith(recordLines(RECORDS));
    expect(recordLines(RECORDS)).toBe('hlabs.home.arpa A 192.168.1.20\nimmich.hlabs.home.arpa A 192.168.1.20');
  });

  it('a server that stopped answering shows "<server> isn\'t answering" on the row', () => {
    expect(dnsProblem(fakeDns({ kind: 'pihole', problem: 'unreachable' }))).toBe("Pi-hole isn't answering");
    expect(dnsProblem(fakeDns({ kind: 'adguard', problem: 'unreachable' }))).toBe("AdGuard Home isn't answering");
    expect(dnsProblem(fakeDns({ kind: 'pihole', problem: 'auth' }))).toBe('Pi-hole refused the password');
    renderWithDaemon(<DnsServerRows dns={fakeDns({ kind: 'adguard', problem: 'unreachable' })} />);
    expect(screen.getByText("AdGuard Home isn't answering")).toBeInTheDocument();
    expect(screen.getByText('AdGuard Home on this computer')).toBeInTheDocument();
  });
});
