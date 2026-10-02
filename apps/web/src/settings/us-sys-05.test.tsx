import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { addressAfterPortChange, WebPortsDialog } from './web-ports-dialog';

const PORTS = {
  https: 443,
  http: 80,
  appPorts: [{ appId: 'adguard-home', appName: 'AdGuard Home', port: 53, protocol: 'udp', label: 'DNS' }],
};

function open(setPorts: (input: unknown) => unknown = () => ({ ok: true })) {
  return renderScreen(() => <WebPortsDialog onClose={vi.fn()} />, {
    'network.ports': () => PORTS,
    'network.setPorts': setPorts,
    'network.status': () => ({}),
  });
}

const set = async (https: string, http: string) => {
  fireEvent.change(await screen.findByLabelText('HTTPS port'), { target: { value: https } });
  fireEvent.change(screen.getByLabelText('HTTP port'), { target: { value: http } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
};

describe('US-SYS-05', () => {
  it('the dialog has both ports and lists the ports apps use, read-only', async () => {
    open();
    await waitFor(() => expect(screen.getByLabelText('HTTPS port')).toHaveValue('443'));
    expect(screen.getByLabelText('HTTP port')).toHaveValue('80');
    const appPorts = screen.getByRole('group', { name: 'Ports apps use' });
    expect(within(appPorts).getByText('53')).toBeInTheDocument();
    expect(within(appPorts).getByText('AdGuard Home · DNS · UDP')).toBeInTheDocument();
  });

  it('refuses ports outside the rules before asking hlabs', async () => {
    const { calls } = open();
    await waitFor(() => expect(screen.getByLabelText('HTTPS port')).toHaveValue('443'));
    await set('500', '80');
    expect(screen.getByText('Use 443 or 80, or a number from 1024 to 65535 outside 12000–14999.')).toBeInTheDocument();
    expect(calls.some((c) => c.path === 'network.setPorts')).toBe(false);
  });

  it('a port in use says "Port <n> is already in use by another program." under its field', async () => {
    open(() => {
      throw daemonError('NETWORK_PORT_IN_USE', { port: 9443 });
    });
    await waitFor(() => expect(screen.getByLabelText('HTTPS port')).toHaveValue('443'));
    await set('9443', '80');
    expect(await screen.findByText('Port 9443 is already in use by another program.')).toBeInTheDocument();
  });

  it('after saving, the page moves to the new port', () => {
    const at = { protocol: 'https:', hostname: 'hlabs.local', pathname: '/settings/network' };
    expect(addressAfterPortChange(at, 8443)).toBe('https://hlabs.local:8443/settings/network');
    expect(addressAfterPortChange(at, 443)).toBe('https://hlabs.local/settings/network');
    expect(addressAfterPortChange({ ...at, protocol: 'http:' }, 8443)).toBeNull();
  });
});
