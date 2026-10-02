import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toaster } from '../shell/toaster';
import { renderScreen } from '../test/render';
import { TailscaleRow, viewingOverTailnet } from './remote-access';

const connected = {
  mode: 'tailscale',
  state: 'connected',
  tailnet: 'tail9.ts.net',
  nodeName: 'hari-home',
  url: 'https://hari-home.tail9.ts.net',
  loginUrl: null,
  keyExpiry: null,
};

describe('US-SYS-03', () => {
  it('Disconnect asks "Turn off remote access?", then turns it off and says so', async () => {
    const { calls } = renderScreen(
      () => (
        <>
          <TailscaleRow remote={connected as never} />
          <Toaster />
        </>
      ),
      { 'network.remote.disconnect': () => ({ ok: true }), 'network.status': () => ({}) },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Turn off remote access?' });
    expect(dialog).toHaveTextContent("People away from home can't open hlabs or its apps until you connect again.");
    expect(dialog).not.toHaveTextContent("You're using remote access right now.");
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => expect(calls.some((c) => c.path === 'network.remote.disconnect')).toBe(true));
    expect(await screen.findByText('Remote access is off')).toBeInTheDocument();
  });

  it('knows when this page came over the tailnet (the dialog then warns it will stop working)', () => {
    expect(viewingOverTailnet('hari-home.tail9.ts.net')).toBe(true);
    expect(viewingOverTailnet('hlabs.local')).toBe(false);
  });
});
