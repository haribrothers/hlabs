// US-APP-15 · Change web address and port: "Web address" is a Subdomain field before ".hlabs.local" (lowercase
// letters, numbers and dashes; not another app's, not hlabs); "Port on this computer" says what the app listens on
// inside its container and takes a port from 12000 to 12999 that is free ("Auto" when empty), with its tailnet address
// at the port + 2000. Saved, a toast shows the new address with Copy.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { appConfig, renderConfig } from '../test/app-config';
import { daemonError } from '../test/render';
import { oneEvent } from '../test/updates';

afterEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
  vi.restoreAllMocks();
});

const network = () => screen.findByRole('group', { name: 'Network' });
const save = () => screen.getByRole('button', { name: 'Save and restart app' });

describe('US-APP-15', () => {
  it('shows the web address as a Subdomain before .hlabs.local, and the port with what the app listens on', async () => {
    renderConfig();
    const list = await network();
    expect(within(list).getByText('Web address')).toBeInTheDocument();
    expect(within(list).getByText('Lowercase letters, numbers and dashes')).toBeInTheDocument();
    expect(within(list).getByRole('textbox', { name: 'Subdomain' })).toHaveValue('vaultwarden');
    expect(within(list).getByText('.hlabs.local')).toBeInTheDocument();
    expect(within(list).getByText('Port on this computer')).toBeInTheDocument();
    expect(within(list).getByText('App listens on 80 inside its container')).toBeInTheDocument();
    const port = within(list).getByRole('textbox', { name: 'Host port' });
    expect(port).toHaveValue('12001');
    // Empty, it's "Auto": hlabs keeps the port it picked.
    fireEvent.change(port, { target: { value: '' } });
    expect(port).toHaveAttribute('placeholder', 'Auto');
    expect(save()).toBeDisabled();
  });

  it.each([
    ['Pass Words', 'Use lowercase letters, numbers and dashes, up to 40'],
    ['immich', 'Another app uses this address. Choose another'],
    ['hlabs', 'hlabs uses this address. Choose another'],
  ])('the address "%s" says "%s" and Save waits', async (value, message) => {
    renderConfig();
    const list = await network();
    fireEvent.change(within(list).getByRole('textbox', { name: 'Subdomain' }), { target: { value } });
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it.each([
    ['8080', 'Choose a port from 12000 to 12999'],
    ['13000', 'Choose a port from 12000 to 12999'],
    ['12002', 'Port 12002 is already in use'],
  ])('the port %s says "%s"', async (value, message) => {
    renderConfig();
    const list = await network();
    fireEvent.change(within(list).getByRole('textbox', { name: 'Host port' }), { target: { value } });
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('a port the daemon finds taken says so on the field', async () => {
    renderConfig({ 'apps.setConfig': () => Promise.reject(daemonError('APP_PORT_IN_USE', { port: 12500 })) });
    const list = await network();
    fireEvent.change(within(list).getByRole('textbox', { name: 'Host port' }), { target: { value: '12500' } });
    fireEvent.click(save());
    expect(await screen.findByText('Port 12500 is already in use')).toBeInTheDocument();
  });

  it('with remote access on, the tailnet address is the port + 2000', async () => {
    renderConfig(
      {},
      appConfig({ port: { hostPort: 12001, containerPort: 80, taken: [], tailnetHost: 'hlabs.tail1234.ts.net' } }),
    );
    const list = await network();
    expect(within(list).getByText('On your tailnet at https://hlabs.tail1234.ts.net:14001')).toBeInTheDocument();
    fireEvent.change(within(list).getByRole('textbox', { name: 'Host port' }), { target: { value: '12345' } });
    expect(within(list).getByText('On your tailnet at https://hlabs.tail1234.ts.net:14345')).toBeInTheDocument();
  });

  it('saved, a toast shows the new address with Copy', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    const ev = oneEvent();
    const { calls } = renderConfig({ 'apps.setConfig': () => ({ jobId: 'j9' }), 'events.stream': ev.handler });
    const list = await network();
    fireEvent.change(within(list).getByRole('textbox', { name: 'Subdomain' }), { target: { value: 'passwords' } });
    fireEvent.change(within(list).getByRole('textbox', { name: 'Host port' }), { target: { value: '12345' } });
    fireEvent.click(save());
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'apps.setConfig')?.input).toMatchObject({
        appId: 'vaultwarden',
        hostname: 'passwords',
        hostPort: 12345,
      }),
    );
    await ev.send('job.finished', {
      jobId: 'j9',
      kind: 'app_config',
      target: 'vaultwarden',
      state: 'succeeded',
      hlabsCode: null,
    });
    const toast = currentToasts().find((t) => t.title === 'Saved. Vaultwarden restarted.');
    expect(toast).toMatchObject({ body: "It's now at https://passwords.hlabs.local" });
    const copyAction = toast!.actions!.find((a) => a.label === 'Copy') as { run: () => void };
    copyAction.run();
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://passwords.hlabs.local'));
  });
});
