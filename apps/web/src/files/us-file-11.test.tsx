// US-FILE-11 · Connect an SMB or NFS drive: "+ Connect a drive" opens the dialog with drives found on the network;
// choosing one and a share fills the address; SMB asks for a username and password, NFS doesn't; both switches start
// on; Connect adds "<Host> · <Share>" and opens it; what went wrong is said in the dialog.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { filesHandlers } from '../test/files';
import { daemonError, renderScreen } from '../test/render';
import { driveName, parseAddress } from './connect-drive-dialog';
import { FilesScreen } from './files-page';

function open(addNetwork: (input: unknown) => unknown = () => ({ locationId: 'new' })) {
  const added: unknown[] = [];
  const result = renderScreen(
    FilesScreen,
    filesHandlers({
      'storage.locations.discover': () => ({
        servers: [
          { name: 'NAS', host: 'nas.local', protocol: 'smb', shares: ['Media', 'Photos', 'Backups'] },
          { name: 'Old box', host: 'old.local', protocol: 'nfs', shares: null },
        ],
      }),
      'storage.locations.addNetwork': (input) => {
        added.push(input);
        return addNetwork(input);
      },
    }),
    { path: '/files' },
  );
  return { ...result, added };
}

async function dialog() {
  fireEvent.click(await screen.findByRole('button', { name: 'Connect a drive' }));
  return screen.findByRole('dialog', { name: 'Connect a network drive' });
}

describe('US-FILE-11', () => {
  it('lists drives found on the network; choosing one and a share fills the address', async () => {
    open();
    const d = await dialog();
    const nas = await within(d).findByRole('button', { name: /nas\.local/ });
    expect(nas).toHaveTextContent('nas.localSMB · 3 shares');
    expect(within(d).getByRole('button', { name: /old\.local/ })).toHaveTextContent('old.localNFS');
    fireEvent.click(nas);
    const shares = within(d).getByRole('radiogroup', { name: 'Shares on nas.local' });
    fireEvent.click(within(shares).getByRole('radio', { name: 'Media' }));
    expect(within(d).getByRole('textbox', { name: 'Or enter an address' })).toHaveValue('smb://nas.local/Media');
    expect(within(shares).getByRole('radio', { name: 'Media' })).toHaveAttribute('aria-checked', 'true');
  });

  it('SMB asks for a username and password; NFS does not; both switches start on', async () => {
    open();
    const d = await dialog();
    expect(within(d).getByRole('textbox', { name: 'Username' })).toBeInTheDocument();
    expect(within(d).getByLabelText('Password')).toBeInTheDocument();
    fireEvent.change(within(d).getByRole('textbox', { name: 'Or enter an address' }), {
      target: { value: 'nfs://nas.local/volume1/media' },
    });
    expect(within(d).queryByRole('textbox', { name: 'Username' })).toBeNull();
    expect(within(d).getByRole('checkbox', { name: 'Let apps use this drive (you choose which ones)' })).toBeChecked();
    expect(within(d).getByRole('checkbox', { name: 'Reconnect automatically after restart' })).toBeChecked();
  });

  it('Connect adds "<Host> · <Share>" with the choices and opens it', async () => {
    const { added, router } = open();
    const d = await dialog();
    fireEvent.click(await within(d).findByRole('button', { name: /nas\.local/ }));
    fireEvent.click(within(d).getByRole('radio', { name: 'Media' }));
    fireEvent.change(within(d).getByRole('textbox', { name: 'Username' }), { target: { value: 'hari' } });
    fireEvent.change(within(d).getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(within(d).getByRole('checkbox', { name: 'Reconnect automatically after restart' }));
    fireEvent.click(within(d).getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(added).toEqual([
      {
        protocol: 'smb',
        host: 'nas.local',
        share: 'Media',
        name: 'NAS · Media',
        username: 'hari',
        password: 'pw',
        appsAllowed: true,
        autoMount: false,
      },
    ]);
    await waitFor(() => expect(router.state.location.search).toEqual({ path: '/drives/new' }));
  });

  it("says what went wrong: wrong password, can't reach, no such share", async () => {
    let answer = daemonError('NAS_AUTH_FAILED');
    open(() => {
      throw answer;
    });
    const d = await dialog();
    const address = within(d).getByRole('textbox', { name: 'Or enter an address' });
    fireEvent.change(address, { target: { value: 'smb://nas.local/Media' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Connect' }));
    expect(await within(d).findByText('Wrong username or password')).toBeInTheDocument();
    answer = daemonError('NAS_UNREACHABLE', { reason: 'unreachable' });
    fireEvent.click(within(d).getByRole('button', { name: 'Connect' }));
    expect(await within(d).findByText("Can't reach nas.local")).toBeInTheDocument();
    answer = daemonError('NAS_UNREACHABLE', { reason: 'noShare' });
    fireEvent.click(within(d).getByRole('button', { name: 'Connect' }));
    expect(await within(d).findByText("There's no share called “Media” on nas.local")).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('reads the three kinds of address, and names drives', () => {
    expect(parseAddress('smb://nas.local/Media')).toEqual({ protocol: 'smb', host: 'nas.local', share: 'Media' });
    expect(parseAddress('\\\\nas.local\\Media\\Films')).toEqual({
      protocol: 'smb',
      host: 'nas.local',
      share: 'Media/Films',
    });
    expect(parseAddress('nfs://nas.local/volume1/media/')).toEqual({
      protocol: 'nfs',
      host: 'nas.local',
      share: '/volume1/media',
    });
    expect(parseAddress('smb://nas.local')).toBeNull();
    expect(parseAddress('ftp://nas/x')).toBeNull();
    expect(driveName({ protocol: 'smb', host: 'nas.local', share: 'media' })).toBe('nas · Media');
    expect(driveName({ protocol: 'nfs', host: 'nas.local', share: '/volume1/media' }, 'NAS')).toBe('NAS · Media');
  });
});
