// US-FILE-01 · See my places in the sidebar: three groups and the storage bar for admins; members see only their own
// places; offline drives keep their name with an offline dot; the open place is marked; This computer lists Homes.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { FilesScreen } from './files-page';
import { activeRow, sidebarGroups } from './places';

const GB = 1e9;

export const folder = (path: string, over: Record<string, unknown> = {}) => ({
  path,
  crumbs: [{ path: '/home', name: null }],
  place: { area: 'home', name: 'Hari', readOnly: false },
  items: [],
  nextCursor: null,
  count: 0,
  filesBytes: 0,
  ...over,
});

export function filesHandlers(over: Record<string, (input: unknown) => unknown> = {}) {
  return {
    'auth.me': fakeMe(),
    'storage.locations.list': () => ({
      locations: [
        { id: 'root', kind: 'local', name: 'This computer', path: '/x', isRoot: true, status: 'ok' },
        { id: 'nas', kind: 'smb', name: 'NAS · Media', path: '/m', isRoot: false, status: 'unreachable' },
        { id: 'usb', kind: 'external', name: 'Backup disk', path: '/v', isRoot: false, status: 'ok' },
      ],
    }),
    'storage.summary': () => ({
      totalBytes: 256 * GB,
      freeBytes: 142 * GB,
      appsBytes: 0,
      filesBytes: 0,
      systemBytes: 0,
      hlabsBytes: 0,
      backupCacheBytes: 0,
      reclaimableImageBytes: 0,
    }),
    'files.list': (input: unknown) => folder((input as { path: string }).path),
    'files.recent': () => ({ items: [] }),
    ...over,
  };
}

const places = () => screen.getByRole('navigation', { name: 'Places' });

describe('US-FILE-01', () => {
  it('an admin sees Files, Locations and Other, and the storage bar', async () => {
    renderScreen(FilesScreen, filesHandlers(), { path: '/files' });
    const nav = await screen.findByRole('navigation', { name: 'Places' });
    expect(
      within(nav)
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual(['Locations', 'Other']);
    await within(nav).findByText('NAS · Media');
    const rows = within(nav)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    // External drives and Trash wait for phase 8 (D-036).
    expect(rows).toEqual([
      'Recents',
      'Home',
      'Photos',
      'Downloads',
      'Shared with me',
      'This computer',
      'NAS · Media · Offline',
      '+ Connect a drive',
      'App data',
    ]);
    expect(await screen.findByText('114 GB of 256 GB used')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: '114 GB of 256 GB used' })).toHaveAttribute('aria-valuenow', '45');
  });

  it('a member sees their own places only, and Shared with me only with the permission', async () => {
    const member = (canSeeShared: boolean) =>
      filesHandlers({ 'auth.me': fakeMe({ role: 'member', displayName: 'Anu', canSeeShared }) });
    const { unmount, calls } = renderScreen(FilesScreen, member(false), { path: '/files' });
    await screen.findByRole('link', { name: 'Recents' });
    expect(
      within(places())
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Recents', 'Home', 'Photos', 'Downloads']);
    expect(within(places()).queryByRole('heading')).toBeNull();
    expect(screen.queryByText(/used$/)).toBeNull();
    // Nothing admin-only is even asked for.
    expect(calls.map((c) => c.path)).not.toContain('storage.locations.list');
    expect(calls.map((c) => c.path)).not.toContain('storage.summary');
    unmount();
    renderScreen(FilesScreen, member(true), { path: '/files' });
    expect(await screen.findByRole('link', { name: 'Shared with me' })).toBeInTheDocument();
  });

  it('the open place is marked, and Photos and Downloads open those folders in Home', async () => {
    const { router } = renderScreen(FilesScreen, filesHandlers(), { path: '/files' });
    const home = await screen.findByRole('link', { name: 'Home' });
    expect(home).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('link', { name: 'Photos' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ path: '/home/Photos' }));
    expect(screen.getByRole('link', { name: 'Photos' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    fireEvent.click(screen.getByRole('link', { name: 'Downloads' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ path: '/home/Downloads' }));
    // A drive that isn't mounted stays clickable.
    fireEvent.click(screen.getByRole('link', { name: /NAS · Media/ }));
    await waitFor(() => expect(router.state.location.search).toEqual({ path: '/drives/nas' }));
  });

  it('This computer shows one folder per Home, and Shared', async () => {
    renderScreen(
      FilesScreen,
      filesHandlers({
        'files.list': () =>
          folder('/users', {
            crumbs: [{ path: '/users', name: null }],
            place: { area: 'users', name: null, readOnly: true },
            items: [
              {
                name: 'Anu',
                path: '/users/anu',
                kind: 'folder',
                size: null,
                childCount: 3,
                modifiedAt: 1,
                mime: null,
                previewUrl: null,
              },
              {
                name: 'Hari',
                path: '/users/hari',
                kind: 'folder',
                size: null,
                childCount: 5,
                modifiedAt: 1,
                mime: null,
                previewUrl: null,
              },
              {
                name: 'Shared',
                path: '/shared',
                kind: 'folder',
                size: null,
                childCount: 2,
                modifiedAt: 1,
                mime: null,
                previewUrl: null,
              },
            ],
            count: 3,
          }),
      }),
      { path: '/files', entries: ['/files?path=/users'] },
    );
    expect(await screen.findByRole('button', { name: 'Anu, folder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hari, folder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shared, folder' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'This computer' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 1, name: 'This computer' })).toBeInTheDocument();
  });

  it('which row is open, for every place', () => {
    const at = (path: string) => activeRow({ path, view: 'folder' });
    expect(activeRow({ path: '', view: 'recents' })).toBe('recents');
    expect(at('/home')).toBe('home');
    expect(at('/home/Documents/Bills')).toBe('home');
    expect(at('/home/Photos/2026')).toBe('photos');
    expect(at('/home/Photoshop')).toBe('home');
    expect(at('/shared/Movies')).toBe('shared');
    expect(at('/users/anu')).toBe('computer');
    expect(at('/appdata/immich')).toBe('appdata');
    expect(at('/drives/nas/Movies')).toBe('drive:nas');
  });

  it('Trash and external drives show once phase 8 ships', () => {
    const drives = [{ id: 'usb', kind: 'external' as const, name: 'Backup disk', isRoot: false, status: 'ok' }];
    const keys = (phase: number) =>
      sidebarGroups({ role: 'admin', canSeeShared: true }, drives, phase).flatMap((g) => g.rows.map((r) => r.key));
    expect(keys(5)).not.toContain('trash');
    expect(keys(5)).not.toContain('drive:usb');
    expect(keys(8)).toContain('trash');
    expect(keys(8)).toContain('drive:usb');
  });
});
