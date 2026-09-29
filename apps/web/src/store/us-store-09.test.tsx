// US-STORE-09 · Review included services, address and login.
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { details, folder } from '../test/store';
import { addressError, InstallSheet } from './install-sheet';

function sheet(d: ReturnType<typeof details>, install: (input: unknown) => unknown = () => ({ jobId: 'j1' })) {
  const onOpenChange = vi.fn();
  const r = renderScreen(() => <InstallSheet details={d} open onOpenChange={onOpenChange} />, {
    'apps.install': install,
    'apps.list': () => ({ apps: [] }),
  });
  return { ...r, onOpenChange };
}

describe('US-STORE-09', () => {
  it('lists what runs, each with its role', async () => {
    sheet(details({ folders: [folder()] }));
    expect(await screen.findByText('Immich server')).toBeInTheDocument();
    expect(screen.getByText('web app')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.getByText('database · private to this app')).toBeInTheDocument();
    expect(screen.getByText('Redis')).toBeInTheDocument();
    expect(screen.getByText('cache · private to this app')).toBeInTheDocument();
  });

  it('the address is editable as the hostname only, and checked', async () => {
    sheet(
      details({ folders: [folder()], install: { ...details().install, takenHostnames: ['hlabs', 'www', 'photos'] } }),
    );
    const field = await screen.findByRole('textbox', { name: 'App address' });
    expect(field).toHaveValue('immich');
    expect(screen.getByText('.hlabs.local')).toBeInTheDocument();
    fireEvent.change(field, { target: { value: 'My_Photos!' } });
    expect(await screen.findByText('Use lowercase letters, numbers and dashes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
    fireEvent.change(field, { target: { value: 'photos' } });
    expect(await screen.findByText('Another app already uses this address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
    fireEvent.change(field, { target: { value: 'family-photos' } });
    expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled();
    expect(addressError('hlabs', ['hlabs'])).toBe('Another app already uses this address');
    expect(addressError('a'.repeat(41), [])).toBe('Use lowercase letters, numbers and dashes');
  });

  it('says whether the hlabs login protects the app, and if it has its own', async () => {
    sheet(details({ folders: [folder()], install: { ...details().install, ownLogin: true } }));
    expect(await screen.findByText('Login required')).toBeInTheDocument();
    expect(screen.getByText('Uses its own login too')).toBeInTheDocument();
  });

  it('reads "No hlabs login" when the manifest has none', async () => {
    sheet(details({ folders: [folder()], install: { ...details().install, webAuth: 'none' } }));
    expect(await screen.findByText('No hlabs login')).toBeInTheDocument();
  });

  it('Cancel closes and creates nothing', async () => {
    const { calls, onOpenChange } = sheet(details({ folders: [folder()] }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(calls.some((c) => c.path === 'apps.install')).toBe(false);
  });

  it('Install sends the hostname, closes and opens the progress page', async () => {
    const { calls, onOpenChange, router } = sheet(details({ folders: [folder()] }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'App address' }), { target: { value: 'photos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/store/install/immich'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(calls.find((c) => c.path === 'apps.install')!.input).toMatchObject({ appId: 'immich', hostname: 'photos' });
  });

  it('a hostname taken meanwhile is said in the sheet', async () => {
    sheet(details({ folders: [folder()] }), () => {
      throw daemonError('HOSTNAME_TAKEN');
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Another app already uses this address');
  });
});
