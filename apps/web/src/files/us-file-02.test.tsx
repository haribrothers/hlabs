// US-FILE-02 · Browse a folder in grid view: FileItems with "24 items" or the size and accessible names; the breadcrumb
// (folded past 4 steps); opening folders by double-click or Enter, and back; the footer for each place; arrow keys;
// a folder that's gone; no Grid/List toggle until phase 5 ships.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { FilesScreen } from './files-page';
import { footerRight } from './folder-view';
import { filesHandlers, folder } from '../test/files';

const entry = (path: string, over: Record<string, unknown> = {}) => ({
  name: path.slice(path.lastIndexOf('/') + 1),
  path,
  kind: 'file',
  size: 1_200_000,
  childCount: null,
  modifiedAt: 1,
  mime: null,
  previewUrl: null,
  ...over,
});
const dir = (path: string, childCount: number) => entry(path, { kind: 'folder', size: null, childCount });

const documents = folder('/home/Documents', {
  crumbs: [
    { path: '/home', name: null },
    { path: '/home/Documents', name: 'Documents' },
  ],
  items: [
    dir('/home/Documents/Bills', 24),
    dir('/home/Documents/Taxes', 1),
    entry('/home/Documents/Lease agreement.pdf', { mime: 'application/pdf' }),
    entry('/home/Documents/Kitchen plan.jpg', {
      size: 3_400_000,
      mime: 'image/jpeg',
      previewUrl: '/api/files/preview/t.s',
    }),
  ],
  count: 4,
  filesBytes: 4_600_000,
});

function open(path = '/home/Documents', list: (input: unknown) => unknown = () => documents) {
  return renderScreen(FilesScreen, filesHandlers({ 'files.list': list }), {
    path: '/files',
    entries: [`/files?path=${encodeURIComponent(path)}`],
  });
}

describe('US-FILE-02', () => {
  it('shows folders then files as FileItems, named with "folder" or their size', async () => {
    open();
    const grid = await screen.findByRole('group', { name: 'Documents' });
    expect(
      within(grid)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Bills, folder', 'Taxes, folder', 'Lease agreement.pdf, 1.2 MB', 'Kitchen plan.jpg, 3.4 MB']);
    expect(within(grid).getByText('24 items')).toBeInTheDocument();
    expect(within(grid).getByText('1 item')).toBeInTheDocument();
    // A photo's thumbnail is asked for at 256px.
    expect(grid.querySelector('img[src^="/api"]')).toHaveAttribute('src', '/api/files/preview/t.s?w=256');
    // One stop for Tab: the first item.
    expect(
      within(grid)
        .getAllByRole('button')
        .map((b) => b.tabIndex),
    ).toEqual([0, -1, -1, -1]);
    // Grid only until phase 5 ships (D-036, D-135).
    expect(screen.queryByRole('radio', { name: 'List view' })).toBeNull();
    expect(screen.queryByText('Share folder')).toBeNull();
  });

  it('the breadcrumb reads Home › Documents; Home opens /home', async () => {
    const { router } = open();
    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(crumbs).toHaveTextContent('HomeDocuments');
    expect(within(crumbs).getByRole('heading', { level: 1, name: 'Documents' })).toBeInTheDocument();
    fireEvent.click(within(crumbs).getByRole('link', { name: 'Home' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ path: '/home' }));
  });

  it('more than 4 steps fold the middle into a "…" menu', async () => {
    const deep = ['/home', '/home/a', '/home/a/b', '/home/a/b/c', '/home/a/b/c/d', '/home/a/b/c/d/e'];
    open('/home/a/b/c/d/e', () =>
      folder('/home/a/b/c/d/e', { crumbs: deep.map((path, i) => ({ path, name: i ? path.at(-1) : null })) }),
    );
    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(crumbs).toHaveTextContent('Home…de');
    expect(within(crumbs).getByRole('button', { name: 'More folders' })).toBeInTheDocument();
  });

  it('double-click or Enter opens a folder; the URL follows and Back returns', async () => {
    const { router } = open('/home/Documents', (input) => {
      const path = (input as { path: string }).path;
      return path === '/home/Documents'
        ? documents
        : folder(path, { crumbs: [{ path, name: path.split('/').at(-1) }] });
    });
    fireEvent.doubleClick(await screen.findByRole('button', { name: 'Bills, folder' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ path: '/home/Documents/Bills' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Bills' })).toBeInTheDocument();
    router.history.back();
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Taxes, folder' }), { key: 'Enter' });
    await waitFor(() => expect(router.state.location.search).toEqual({ path: '/home/Documents/Taxes' }));
  });

  it('the arrow keys move between items', async () => {
    open();
    const bills = await screen.findByRole('button', { name: 'Bills, folder' });
    bills.focus();
    fireEvent.keyDown(bills, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Taxes, folder' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(screen.getByRole('button', { name: 'Kitchen plan.jpg, 3.4 MB' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(screen.getByRole('button', { name: 'Lease agreement.pdf, 1.2 MB' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Lease agreement.pdf, 1.2 MB' }).tabIndex).toBe(0);
  });

  it('the footer counts the folder and says who can see it', async () => {
    open();
    expect(await screen.findByText('4 items · 4.6 MB')).toBeInTheDocument();
    expect(screen.getByText("Private to you · Hari's Home folder")).toBeInTheDocument();
    const me = { role: 'admin' as const, displayName: 'Hari', canSeeShared: true, accent: 'violet' as const };
    expect(footerRight({ area: 'shared', name: null, readOnly: false }, me)).toBe(
      'Everyone who can see Shared can open this',
    );
    expect(footerRight({ area: 'drive', name: 'NAS · Media', readOnly: false }, me)).toBe('NAS · Media');
    expect(footerRight({ area: 'user', name: 'Anu', readOnly: false }, me)).toBe("Anu's Home folder");
  });

  it('a folder deleted while open says so, with Go to Home', async () => {
    const { router } = open('/home/Old', () => {
      throw daemonError('NOT_FOUND');
    });
    expect(await screen.findByText('This folder no longer exists')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Home' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ path: '/home' }));
  });

  it('an empty folder says so, and how to add files when it can', async () => {
    open('/home/Empty', () => folder('/home/Empty'));
    expect(await screen.findByText('This folder is empty')).toBeInTheDocument();
    expect(screen.getByText('Drop files here or use Upload')).toBeInTheDocument();
  });
});
