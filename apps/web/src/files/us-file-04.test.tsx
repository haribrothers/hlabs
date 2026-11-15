// US-FILE-04 · Search files: from 2 characters, after a 250 ms pause, in the open place and below; results show their
// folder; capped and partial results say so; no matches says so; Escape or clearing returns to the folder.
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { filesHandlers, folder } from '../test/files';
import { renderScreen } from '../test/render';
import { FilesScreen } from './files-page';
import { resultFolder } from './search';

afterEach(() => vi.useRealTimers());

const hit = (path: string, kind = 'file') => ({
  name: path.slice(path.lastIndexOf('/') + 1),
  path,
  kind,
  size: kind === 'file' ? 1000 : null,
  childCount: kind === 'file' ? null : 2,
  modifiedAt: 1,
  mime: null,
  previewUrl: null,
});

function open(search: (input: unknown) => unknown) {
  return renderScreen(
    FilesScreen,
    filesHandlers({
      'files.list': () =>
        folder('/home/Documents', {
          crumbs: [
            { path: '/home', name: null },
            { path: '/home/Documents', name: 'Documents' },
          ],
          items: [hit('/home/Documents/Lease.pdf')],
          count: 1,
        }),
      'files.search': search,
    }),
    { path: '/files', entries: ['/files?path=%2Fhome%2FDocuments'] },
  );
}

describe('US-FILE-04', () => {
  it('searches the open place after a 250 ms pause, from 2 characters, and shows where each result is', async () => {
    const { calls } = open(() => ({
      items: [hit('/home/Documents/Bills', 'folder'), hit('/home/Documents/Bills/March bill.pdf')],
      capped: false,
      truncated: false,
    }));
    const field = await screen.findByRole('searchbox', { name: 'Search files' });
    vi.useFakeTimers();
    fireEvent.change(field, { target: { value: 'b' } });
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(calls.filter((c) => c.path === 'files.search')).toHaveLength(0);
    fireEvent.change(field, { target: { value: 'bi' } });
    fireEvent.change(field, { target: { value: 'bil' } });
    await act(() => vi.advanceTimersByTimeAsync(249));
    expect(calls.filter((c) => c.path === 'files.search')).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(1));
    // Let the query's own timers run before going back to real time.
    await act(() => vi.advanceTimersByTimeAsync(50));
    vi.useRealTimers();
    await waitFor(() =>
      expect(calls.filter((c) => c.path === 'files.search').map((c) => c.input)).toEqual([
        { path: '/home/Documents', query: 'bil', limit: 200 },
      ]),
    );
    const result = await screen.findByRole('button', { name: 'March bill.pdf, 1 KB' });
    expect(result).toHaveTextContent('Home › Documents › Bills');
    expect(screen.getByRole('button', { name: 'Bills, folder' })).toHaveTextContent('Home › Documents');
    // The folder's own items and footer are gone while searching.
    expect(screen.queryByRole('button', { name: /^Lease\.pdf/ })).toBeNull();
    expect(screen.queryByText(/^1 item ·/)).toBeNull();
  });

  it('Escape or clearing the field returns to the folder', async () => {
    open(() => ({ items: [hit('/home/Documents/a bill.pdf')], capped: false, truncated: false }));
    const field = await screen.findByRole('searchbox', { name: 'Search files' });
    fireEvent.change(field, { target: { value: 'bill' } });
    await screen.findByRole('button', { name: /^a bill\.pdf/ });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(field).toHaveValue('');
    expect(await screen.findByRole('button', { name: /^Lease\.pdf/ })).toBeInTheDocument();
    fireEvent.change(field, { target: { value: 'bill' } });
    await screen.findByRole('button', { name: /^a bill\.pdf/ });
    fireEvent.change(field, { target: { value: '' } });
    expect(await screen.findByRole('button', { name: /^Lease\.pdf/ })).toBeInTheDocument();
  });

  it('no matches says so', async () => {
    open(() => ({ items: [], capped: false, truncated: false }));
    fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'zebra' } });
    expect(await screen.findByText('No files match “zebra”')).toBeInTheDocument();
  });

  it('capped or partial results say so', async () => {
    let answer = { items: [hit('/home/Documents/scan 1.png')], capped: true, truncated: false };
    const { unmount } = open(() => answer);
    fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'scan' } });
    expect(await screen.findByText('Showing the first 200 results')).toBeInTheDocument();
    unmount();
    answer = { ...answer, capped: false, truncated: true };
    open(() => answer);
    fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'scan' } });
    expect(await screen.findByText('Showing the first results')).toBeInTheDocument();
  });

  it("a result's folder line starts from the searched place", () => {
    const crumbs = [
      { path: '/users', name: null },
      { path: '/users/anu', name: 'Anu' },
    ];
    expect(resultFolder(crumbs, '/users/anu', '/users/anu/Docs/x.pdf')).toBe('This computer › Anu › Docs');
    expect(resultFolder([{ path: '/home', name: null }], '/home', '/home/x.pdf')).toBe('Home');
  });
});
