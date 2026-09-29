// US-STORE-08 · Choose folder access in the install sheet.
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { details, folder } from '../test/store';
import { InstallSheet, placeLabel } from './install-sheet';

function sheet(d: ReturnType<typeof details>, onOpenChange = vi.fn()) {
  const r = renderScreen(() => <InstallSheet details={d} open onOpenChange={onOpenChange} />, {
    'apps.install': () => ({ jobId: 'j1' }),
    'apps.list': () => ({ apps: [] }),
  });
  return { ...r, onOpenChange };
}

describe('US-STORE-08', () => {
  it('opens titled "Install Immich" with "Review what it can access"', async () => {
    sheet(details({ folders: [folder()] }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Install Immich');
    expect(dialog).toHaveTextContent('Review what it can access');
  });

  it('shows each folder where it goes, its mode and what it is for', async () => {
    sheet(
      details({
        folders: [
          folder(),
          folder({
            key: 'import',
            label: 'Import',
            description: 'Import existing photos',
            mode: 'ro',
            required: false,
            default: {
              storageLocationId: 'root',
              subpath: 'shared/Media',
              place: { area: 'shared', locationName: null, path: 'Media' },
              available: true,
            },
          }),
        ],
      }),
    );
    expect(await screen.findByText('Home › Photos')).toBeInTheDocument();
    expect(screen.getByText('Read and write · where your library is stored')).toBeInTheDocument();
    expect(screen.getByText('Shared › Media')).toBeInTheDocument();
    expect(screen.getByText('Read only · import existing photos')).toBeInTheDocument();
    expect(placeLabel({ area: 'location', locationName: 'NAS', path: 'Photos archive' })).toBe('NAS › Photos archive');
  });

  it('an optional folder has a Switch; turning it off leaves the mount out', async () => {
    const optional = folder({ key: 'import', required: false });
    const { calls } = sheet(details({ folders: [folder(), optional] }));
    const switches = await screen.findAllByRole('switch', { name: 'Give access to Home › Photos' });
    // The required one can't be turned off.
    expect(switches[0]).toBeDisabled();
    expect(switches[1]).toBeChecked();
    fireEvent.click(switches[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    await vi.waitFor(() => expect(calls.some((c) => c.path === 'apps.install')).toBe(true));
    const input = calls.find((c) => c.path === 'apps.install')!.input as { mounts: Array<{ target: string }> };
    expect(input.mounts.map((m) => m.target)).toEqual(['library']);
  });

  it('an optional folder without a default place is off', async () => {
    sheet(details({ folders: [folder({ key: 'extra', label: 'Extra', required: false, default: null })] }));
    expect(await screen.findByRole('switch', { name: 'Give access to Extra' })).not.toBeChecked();
  });

  it('a folder on an offline NAS disables Install and says so', async () => {
    sheet(
      details({
        folders: [
          folder({
            default: {
              storageLocationId: 'nas',
              subpath: 'Photos archive',
              place: { area: 'location', locationName: 'NAS', path: 'Photos archive' },
              available: false,
            },
          }),
        ],
      }),
    );
    expect((await screen.findAllByText('NAS › Photos archive is offline')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it('sends the default place with the manifest mode', async () => {
    const { calls } = sheet(details({ folders: [folder({ mode: 'ro' })] }));
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    await vi.waitFor(() => expect(calls.some((c) => c.path === 'apps.install')).toBe(true));
    expect(calls.find((c) => c.path === 'apps.install')!.input).toMatchObject({
      mounts: [{ target: 'library', storageLocationId: 'root', subpath: 'users/hari/Photos', mode: 'ro' }],
    });
  });
});
