// US-STORE-07 · See requirements and what an app can access.
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
import { details } from '../test/store';
import { AppDetails } from './app-details';
import { gb } from './app-access';

const never = () => new Promise(() => {});
const GiB = 2 ** 30;

function show(d: ReturnType<typeof details>) {
  renderScreen(() => <AppDetails appId="immich" />, {
    'store.getApp': () => d,
    'apps.list': () => ({ apps: [] }),
    'events.stream': never,
  });
}

describe('US-STORE-07', () => {
  it('warns when it recommends more memory than hlabs has free, and still allows install', async () => {
    show(
      details({
        requirements: { memoryBytes: 4 * GiB, memoryFreeBytes: 2.5 * GiB, diskBytes: null, diskFreeBytes: null },
      }),
    );
    expect(await screen.findByText('Recommends 4 GB of memory. hlabs has 2.5 GB free.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled();
  });

  it('needs more disk than there is free: says so and disables Install', async () => {
    show(
      details({
        requirements: { memoryBytes: null, memoryFreeBytes: null, diskBytes: 10 * GiB, diskFreeBytes: 3 * GiB },
      }),
    );
    expect(await screen.findByText('Needs 10 GB of free space. You have 3 GB.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it('shows no warning when the manifest has no requirements or there is room', async () => {
    show(
      details({
        requirements: { memoryBytes: GiB, memoryFreeBytes: 8 * GiB, diskBytes: GiB, diskFreeBytes: 100 * GiB },
      }),
    );
    await screen.findByRole('heading', { level: 1, name: 'Immich' });
    expect(screen.queryByText(/Recommends|Needs .* free space/)).toBeNull();
  });

  it('lists access in plain words; Docker access and raw ports are marked risky', async () => {
    show(
      details({
        folders: [
          {
            key: 'library',
            label: 'Photo library',
            description: 'Where your library is stored',
            mode: 'rw',
            required: true,
          },
          { key: 'import', label: 'Existing photos', description: null, mode: 'ro', required: false },
        ],
        access: { network: 'lan', ports: [{ label: 'DNS', host: 53, protocol: 'udp' }], gpu: true, dockerSocket: true },
      }),
    );
    const list = await screen.findByRole('list', { name: 'What it can access' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      'Your home network onlyNetwork',
      'Photo libraryRead and write · Where your library is stored',
      'Existing photosRead only',
      'DNS on port 53Opens a port on this computer to your network.Risky',
      'Graphics card (GPU)Uses your graphics card to run faster.',
      'Control of your other apps (Docker)Can start, stop and change every app on hlabs.Risky',
    ]);
    expect(within(list).getAllByText('Risky')).toHaveLength(2);
  });

  it('network: "No network" and "Internet"', async () => {
    show(details({ access: { network: 'none', ports: [], gpu: false, dockerSocket: false } }));
    expect(await screen.findByText('No network')).toBeInTheDocument();
  });

  it('an app it needs that isn’t installed: a link to it, and Install disabled', async () => {
    show(
      details({
        dependsOn: [
          { appId: 'postgres', name: 'PostgreSQL', installed: false },
          { appId: 'redis', name: 'Redis', installed: true },
        ],
      }),
    );
    expect(await screen.findByRole('link', { name: 'Needs PostgreSQL installed first' })).toHaveAttribute(
      'href',
      '/store/app/postgres',
    );
    expect(screen.queryByText('Needs Redis installed first')).toBeNull();
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it('GB like the manifest: 2048 MB is 2', () => {
    expect(gb(2048 * 2 ** 20)).toBe('2');
    expect(gb(512 * 2 ** 20)).toBe('0.5');
    expect(gb(120 * GiB)).toBe('120');
  });
});
