// US-FILE-25 · Choose a folder for an app: "Change" on the install sheet's folder rows, the FolderPicker (places,
// folders only, breadcrumb, selecting and opening, "Use …", read-only places, New folder, keyboard, phone) and what
// Install sends.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstallSheet } from '../store/install-sheet';
import { filesHandlers } from '../test/files';
import { fakeMe } from '../test/me';
import { daemonError, renderScreen } from '../test/render';
import { details, folder as manifestFolder } from '../test/store';
import { pickerPlaces, type Drive } from './places';

const entry = (path: string) => ({
  name: path.slice(path.lastIndexOf('/') + 1),
  path,
  kind: 'folder',
  size: null,
  childCount: 0,
  modifiedAt: 1,
  mime: null,
  previewUrl: null,
});

/** A small tree as files.list answers it with `kinds: ['folder']`. */
const TREE: Record<string, { folders: string[]; readOnly?: boolean; location: { id: string; subpath: string } }> = {
  '/home': { folders: ['Documents', 'Photos'], location: { id: 'root', subpath: 'users/hari' } },
  '/home/Photos': { folders: ['Camera roll', 'Holidays 2025'], location: { id: 'root', subpath: 'users/hari/Photos' } },
  '/home/Photos/Holidays 2025': { folders: [], location: { id: 'root', subpath: 'users/hari/Photos/Holidays 2025' } },
  '/shared': { folders: ['Media'], location: { id: 'root', subpath: 'shared' } },
  '/drives/media': { folders: ['Photos'], location: { id: 'media', subpath: '' } },
  '/drives/media/Photos': { folders: [], location: { id: 'media', subpath: 'Photos' } },
  '/drives/archive': { folders: ['Old photos'], readOnly: true, location: { id: 'archive', subpath: '' } },
};

const CRUMB_TOPS: Record<string, string> = {
  '/drives/media': 'NAS · Media',
  '/drives/archive': 'NAS · Archive',
};

function crumbsOf(path: string) {
  const parts = path.split('/').filter(Boolean);
  const topLen = parts[0] === 'drives' ? 2 : 1;
  const top = `/${parts.slice(0, topLen).join('/')}`;
  const out = [{ path: top, name: CRUMB_TOPS[top] ?? null }];
  let at = top;
  for (const p of parts.slice(topLen)) {
    at = `${at}/${p}`;
    out.push({ path: at, name: p });
  }
  return out;
}

const drives = [
  { id: 'root', kind: 'local', name: 'This computer', path: '/x', isRoot: true, status: 'ok', appsAllowed: true },
  { id: 'media', kind: 'smb', name: 'NAS · Media', path: '/m', isRoot: false, status: 'ok', appsAllowed: true },
  {
    id: 'archive',
    kind: 'smb',
    name: 'NAS · Archive',
    path: '/a',
    isRoot: false,
    status: 'ok',
    appsAllowed: true,
    readOnly: true,
  },
  {
    id: 'backups',
    kind: 'nfs',
    name: 'NAS · Backups',
    path: '/b',
    isRoot: false,
    status: 'unreachable',
    appsAllowed: true,
  },
  { id: 'private', kind: 'smb', name: 'NAS · Private', path: '/p', isRoot: false, status: 'ok', appsAllowed: false },
  { id: 'usb', kind: 'external', name: 'Backup disk', path: '/v', isRoot: false, status: 'ok', appsAllowed: true },
];

function sheet(opts: { folders?: ReturnType<typeof manifestFolder>[]; me?: Record<string, unknown> } = {}) {
  const tree = structuredClone(TREE);
  const lists: Array<{ path: string; kinds?: string[] }> = [];
  const made: string[] = [];
  const r = renderScreen(
    () => (
      <InstallSheet details={details({ folders: opts.folders ?? [manifestFolder()] })} open onOpenChange={vi.fn()} />
    ),
    filesHandlers({
      'auth.me': fakeMe(opts.me),
      'storage.locations.list': () => ({ locations: drives.map((d) => ({ ...d, autoMount: true, usedBy: [] })) }),
      'files.list': (input) => {
        const i = input as { path: string; kinds?: string[] };
        lists.push(i);
        const node = tree[i.path];
        if (!node) throw daemonError('NOT_FOUND');
        return {
          path: i.path,
          crumbs: crumbsOf(i.path),
          place: { area: 'home', name: 'Hari', readOnly: !!node.readOnly },
          location: node.location,
          items: node.folders.map((f) => entry(`${i.path}/${f}`)),
          nextCursor: null,
          count: node.folders.length,
          filesBytes: 0,
        };
      },
      'files.mkdir': (input) => {
        const i = input as { path: string; name: string };
        made.push(`${i.path}/${i.name}`);
        tree[i.path]!.folders.push(i.name);
        tree[`${i.path}/${i.name}`] = {
          folders: [],
          location: { ...tree[i.path]!.location, subpath: `${tree[i.path]!.location.subpath}/${i.name}` },
        };
        return { path: `${i.path}/${i.name}` };
      },
      'apps.install': () => ({ jobId: 'j1' }),
      'apps.list': () => ({ apps: [] }),
    }),
  );
  return { ...r, lists, made };
}

const optional = manifestFolder({
  key: 'existing',
  label: 'Existing photos',
  description: 'Import existing photos',
  mode: 'ro',
  required: false,
  default: null,
});

async function openPicker(name = 'Change folder for Photo library') {
  fireEvent.click(await screen.findByRole('button', { name }));
  return screen.findByRole('dialog', { name: /Choose a folder for Immich/ });
}

const option = (picker: HTMLElement, name: string) => within(picker).findByRole('option', { name });

afterEach(() => {
  // @ts-expect-error tests put matchMedia in for the phone case
  delete window.matchMedia;
});

describe('US-FILE-25', () => {
  it('each folder row shows its place, mode and role and a "Change" button; an optional folder keeps its Switch', async () => {
    sheet({ folders: [manifestFolder(), optional] });
    expect(await screen.findByText('Home › Photos')).toBeInTheDocument();
    expect(screen.getByText('Read and write · where your library is stored')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change folder for Photo library' })).toHaveTextContent('Change');
    expect(screen.getByRole('button', { name: 'Change folder for Existing photos' })).toBeInTheDocument();
    // The required folder has no Switch; the optional one has, off with no default.
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    expect(screen.getByRole('switch', { name: 'Give access to Existing photos' })).not.toBeChecked();
  });

  it('"Change" opens the picker for the folder, at its current place, with its role and mode', async () => {
    const { lists } = sheet();
    const picker = await openPicker();
    expect(picker).toHaveTextContent('Choose a folder for Immich');
    expect(picker).toHaveTextContent('Photo library · Read and write');
    expect(await option(picker, 'Camera roll')).toBeInTheDocument();
    expect(lists.at(-1)).toMatchObject({ path: '/home/Photos', kinds: ['folder'] });
    expect(within(picker).getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('HomePhotos');
    expect(within(picker).getByRole('button', { name: 'Use Photos' })).toBeEnabled();
  });

  it('a folder that doesn’t exist yet opens its parent', async () => {
    const { lists } = sheet({
      folders: [
        manifestFolder({
          default: {
            storageLocationId: 'root',
            subpath: 'users/hari/Pictures',
            place: { area: 'home', locationName: null, path: 'Pictures' },
            available: true,
          },
        }),
      ],
    });
    const picker = await openPicker();
    expect(await option(picker, 'Documents')).toBeInTheDocument();
    expect(lists.map((l) => l.path)).toEqual(['/home/Pictures', '/home']);
  });

  it('places: Home, Shared, then drives that let apps use them; a read-only drive says so; an offline one won’t open', async () => {
    const { lists } = sheet();
    const picker = await openPicker();
    const places = within(picker).getByRole('navigation', { name: 'Places' });
    await waitFor(() =>
      expect(
        within(places)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Home', 'Shared', 'NAS · Media', 'NAS · ArchiveRead only', 'NAS · BackupsOffline']),
    );
    const offline = within(places).getByRole('button', { name: /NAS · Backups/ });
    expect(offline).toHaveAttribute('aria-disabled', 'true');
    const before = lists.length;
    fireEvent.click(offline);
    expect(lists.length).toBe(before);
    fireEvent.click(within(places).getByRole('button', { name: 'Shared' }));
    expect(await option(picker, 'Media')).toBeInTheDocument();
    expect(within(places).getByRole('button', { name: 'Shared' })).toHaveAttribute('aria-current', 'location');
  });

  it('pickerPlaces: never App data or This computer; external drives from phase 8; members get no drives', () => {
    const all = drives as Drive[];
    expect(pickerPlaces({ role: 'admin', canSeeShared: true }, all, 5).map((p) => p.label)).toEqual([
      'Home',
      'Shared',
      'NAS · Media',
      'NAS · Archive',
      'NAS · Backups',
    ]);
    expect(pickerPlaces({ role: 'admin', canSeeShared: true }, all, 8).map((p) => p.label)).toContain('Backup disk');
    expect(pickerPlaces({ role: 'member', canSeeShared: false }, all, 8).map((p) => p.path)).toEqual(['/home']);
    expect(pickerPlaces({ role: 'member', canSeeShared: true }, all, 8).map((p) => p.path)).toEqual([
      '/home',
      '/shared',
    ]);
  });

  it('a member’s picker offers only their Home (and Shared with the permission) and never asks for drives', async () => {
    const { calls } = sheet({ me: { role: 'member', canSeeShared: false } });
    const picker = await openPicker();
    await option(picker, 'Camera roll');
    const places = within(picker).getByRole('navigation', { name: 'Places' });
    expect(
      within(places)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Home']);
    expect(calls.some((c) => c.path === 'storage.locations.list')).toBe(false);
  });

  it('a click selects ("Use Holidays 2025"), a double-click opens, the breadcrumb goes back up', async () => {
    sheet();
    const picker = await openPicker();
    fireEvent.click(await option(picker, 'Holidays 2025'));
    expect(await option(picker, 'Holidays 2025')).toHaveAttribute('aria-selected', 'true');
    expect(within(picker).getByRole('button', { name: 'Use Holidays 2025' })).toBeInTheDocument();
    fireEvent.doubleClick(await option(picker, 'Holidays 2025'));
    expect(await within(picker).findByText('No folders in Holidays 2025')).toBeInTheDocument();
    expect(within(picker).getByRole('button', { name: 'Use Holidays 2025' })).toBeInTheDocument();
    fireEvent.click(
      within(within(picker).getByRole('navigation', { name: 'Breadcrumb' })).getByRole('button', { name: 'Home' }),
    );
    expect(await option(picker, 'Documents')).toBeInTheDocument();
    expect(within(picker).getByRole('button', { name: 'Use Home' })).toBeInTheDocument();
  });

  it('arrow keys move between folders and Enter opens one; Escape closes the picker with nothing changed', async () => {
    sheet();
    const picker = await openPicker();
    const first = await option(picker, 'Camera roll');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    const second = await option(picker, 'Holidays 2025');
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(second, { key: 'ArrowUp' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    fireEvent.keyDown(second, { key: 'Enter' });
    expect(await within(picker).findByText('No folders in Holidays 2025')).toBeInTheDocument();
    fireEvent.keyDown(picker, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Choose a folder/ })).toBeNull());
    expect(screen.getByText('Home › Photos')).toBeInTheDocument();
  });

  it('"Use …" puts the folder on the row, and Install sends it as { target, storageLocationId, subpath, mode }', async () => {
    const { calls } = sheet();
    const picker = await openPicker();
    fireEvent.click(await within(picker).findByRole('button', { name: 'NAS · Media' }));
    fireEvent.click(await option(picker, 'Photos'));
    fireEvent.click(within(picker).getByRole('button', { name: 'Use Photos' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Choose a folder/ })).toBeNull());
    expect(screen.getByText('NAS · Media › Photos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    await vi.waitFor(() => expect(calls.some((c) => c.path === 'apps.install')).toBe(true));
    expect(calls.find((c) => c.path === 'apps.install')!.input).toMatchObject({
      mounts: [{ target: 'library', storageLocationId: 'media', subpath: 'Photos', mode: 'rw' }],
    });
  });

  it('a drive’s top reads "Use NAS · Media"; choosing it sends an empty subpath', async () => {
    const { calls } = sheet();
    const picker = await openPicker();
    fireEvent.click(await within(picker).findByRole('button', { name: 'NAS · Media' }));
    await option(picker, 'Photos');
    fireEvent.click(within(picker).getByRole('button', { name: 'Use NAS · Media' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Choose a folder/ })).toBeNull());
    expect(screen.getByText('NAS · Media')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    await vi.waitFor(() => expect(calls.some((c) => c.path === 'apps.install')).toBe(true));
    expect(calls.find((c) => c.path === 'apps.install')!.input).toMatchObject({
      mounts: [{ storageLocationId: 'media', subpath: '' }],
    });
  });

  it('a folder the app writes to can’t go on a read-only drive; a read-only folder can, and Change turns it on', async () => {
    const { calls } = sheet({ folders: [manifestFolder(), optional] });
    let picker = await openPicker();
    fireEvent.click(await within(picker).findByRole('button', { name: /^NAS · Archive/ }));
    fireEvent.click(await option(picker, 'Old photos'));
    expect(within(picker).getByRole('button', { name: 'Use Old photos' })).toBeDisabled();
    expect(within(picker).getByRole('status')).toHaveTextContent('This folder is read only');
    fireEvent.click(within(picker).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Choose a folder/ })).toBeNull());

    picker = await openPicker('Change folder for Existing photos');
    expect(picker).toHaveTextContent('Existing photos · Read only');
    fireEvent.click(await within(picker).findByRole('button', { name: /^NAS · Archive/ }));
    fireEvent.click(await option(picker, 'Old photos'));
    fireEvent.click(within(picker).getByRole('button', { name: 'Use Old photos' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Choose a folder/ })).toBeNull());
    expect(screen.getByText('NAS · Archive › Old photos')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Give access to Existing photos' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    await vi.waitFor(() => expect(calls.some((c) => c.path === 'apps.install')).toBe(true));
    expect(calls.find((c) => c.path === 'apps.install')!.input).toMatchObject({
      mounts: [
        { target: 'library', storageLocationId: 'root', subpath: 'users/hari/Photos', mode: 'rw' },
        { target: 'existing', storageLocationId: 'archive', subpath: 'Old photos', mode: 'ro' },
      ],
    });
  });

  it('"+ New folder" makes a folder in the open one and selects it', async () => {
    const { made } = sheet();
    const picker = await openPicker();
    await option(picker, 'Camera roll');
    fireEvent.click(within(picker).getByRole('button', { name: '+ New folder' }));
    const dialog = await screen.findByRole('dialog', { name: 'New folder' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), { target: { value: 'Immich' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(await option(picker, 'Immich')).toHaveAttribute('aria-selected', 'true');
    expect(made).toEqual(['/home/Photos/Immich']);
    expect(within(picker).getByRole('button', { name: 'Use Immich' })).toBeInTheDocument();
  });

  it('on a phone a tap opens a folder, ‹ goes back up, and "Use" takes the open one', async () => {
    window.matchMedia = ((query: string) => ({
      matches: !query.includes('min-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    sheet();
    const picker = await openPicker();
    fireEvent.click(await option(picker, 'Holidays 2025'));
    expect(await within(picker).findByText('No folders in Holidays 2025')).toBeInTheDocument();
    fireEvent.click(within(picker).getByRole('button', { name: 'Back to Photos' }));
    expect(await option(picker, 'Camera roll')).toHaveAttribute('aria-selected', 'false');
    expect(within(picker).getByRole('button', { name: 'Use Photos' })).toBeInTheDocument();
  });
});
