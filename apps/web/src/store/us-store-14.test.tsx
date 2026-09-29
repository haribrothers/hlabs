// US-STORE-14 · Retry or remove a failed install.
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { daemonError, renderScreen, type Handlers } from '../test/render';
import { appDetail, details, installJob } from '../test/store';
import { AppGrid, type HomeApp } from '../home/app-grid';
import { InstallProgressPage } from './install-progress';

const never = () => new Promise(() => {});

function failed(stateDetail: Record<string, unknown>, handlers: Handlers = {}) {
  return renderScreen(() => <InstallProgressPage appId="immich" />, {
    'store.getApp': () => details(),
    'apps.get': () => appDetail({ state: 'install_failed', stateDetail, nextFreePort: 12004 }),
    'jobs.get': () => installJob({ state: 'failed', step: 'start' }),
    'apps.list': () => ({ apps: [] }),
    'apps.retryInstall': () => ({ jobId: 'j2' }),
    'events.stream': never,
    ...handlers,
  });
}

describe('US-STORE-14', () => {
  it('"Use a different port" proposes the next free port and retries with it', async () => {
    const { calls } = failed({ code: 'APP_PORT_IN_USE', port: 2283, step: 'start' });
    fireEvent.click(await screen.findByRole('button', { name: 'Use a different port' }));
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByRole('textbox', { name: 'Port' });
    expect(field).toHaveValue('12004');
    fireEvent.change(field, { target: { value: '99' } });
    expect(within(dialog).getByText('Choose a port from 12000 to 12999')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Try again' })).toBeDisabled();
    fireEvent.change(field, { target: { value: '12010' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.path === 'apps.retryInstall')?.input).toEqual({
        appId: 'immich',
        portOverrides: { web: 12010 },
      }),
    );
  });

  it('a port taken meanwhile is said in the dialog', async () => {
    failed(
      { code: 'APP_PORT_IN_USE', port: 2283, step: 'start' },
      {
        'apps.retryInstall': () => {
          throw daemonError('APP_PORT_IN_USE');
        },
      },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Use a different port' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
    expect(await within(dialog).findByText('That port is in use too. Try another.')).toBeInTheDocument();
  });

  it('"Try again" retries the install', async () => {
    const { calls } = failed({ code: 'APP_NETWORK_UNREACHABLE', step: 'pull' });
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(calls.some((c) => c.path === 'apps.retryInstall')).toBe(true));
    expect(calls.find((c) => c.path === 'apps.retryInstall')!.input).toEqual({ appId: 'immich' });
  });

  it('"Remove partial install" asks first, removes without keeping data and returns to the store', async () => {
    const { calls, router } = failed(
      { code: 'APP_HEALTH_TIMEOUT', seconds: 120, step: 'start' },
      {
        'apps.uninstall': () => ({ jobId: 'j3' }),
        'jobs.get': (input) =>
          (input as { jobId: string }).jobId === 'j3'
            ? installJob({ id: 'j3', kind: 'app_uninstall', state: 'succeeded' })
            : installJob({ state: 'failed', step: 'start' }),
      },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Remove partial install' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Remove Immich?');
    expect(confirm).toHaveTextContent('Any containers and data it created are deleted.');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/store/app/immich'));
    expect(calls.find((c) => c.path === 'apps.uninstall')!.input).toEqual({ appId: 'immich', keepData: false });
  });

  it('on Home a failed install shows an error badge and opens this page', async () => {
    const tile: HomeApp = {
      id: 'immich',
      name: 'Immich',
      state: 'install_failed',
      icon: { logoUrl: null, gradient: null, fallback: null },
      embed: false,
      urls: { local: 'https://immich.hlabs.local', tailnet: null },
    };
    const { router } = renderScreen(() => <AppGrid apps={[tile]} isAdmin={false} />, {});
    const button = await screen.findByRole('button', { name: 'Immich, error' });
    expect(button).toHaveTextContent('Error');
    fireEvent.click(button);
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/store/install/immich'));
  });

  it('on Home an install in progress shows its ring and opens its progress', async () => {
    const tile: HomeApp = {
      id: 'immich',
      name: 'Immich',
      state: 'installing',
      icon: { logoUrl: null, gradient: null, fallback: null },
      embed: false,
      urls: { local: 'https://immich.hlabs.local', tailnet: null },
    };
    const { router } = renderScreen(
      () => <AppGrid apps={[tile]} isAdmin={false} progress={new Map([['immich', 42]])} />,
      {},
    );
    fireEvent.click(await screen.findByRole('button', { name: /Immich, installing… 42%/i }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/store/install/immich'));
  });
});
