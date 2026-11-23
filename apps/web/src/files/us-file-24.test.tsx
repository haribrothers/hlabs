// US-FILE-24 · See skeletons while a folder loads: nothing for 150 ms, then skeleton items labelled "Loading files"
// while the breadcrumb and toolbar stay usable; "Still loading…" after 10 s; no shimmer with reduced motion; a cached
// folder shows at once; a failed load offers Try again; an empty folder says so (and how to fill it when writable).
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { filesHandlers, folder } from '../test/files';
import { FilesScreen } from './files-page';
import { FolderSkeleton, SKELETON_AFTER_MS, SLOW_AFTER_MS } from './folder-skeleton';
import { provisionalCrumbs, provisionalReadOnly } from './folder-view';

const documents = folder('/home/Documents', {
  crumbs: [
    { path: '/home', name: null },
    { path: '/home/Documents', name: 'Documents' },
  ],
  items: [
    {
      name: 'Bills',
      path: '/home/Documents/Bills',
      kind: 'folder',
      size: null,
      childCount: 2,
      modifiedAt: 1,
      mime: null,
      previewUrl: null,
    },
  ],
  count: 1,
});

function open(list: (input: unknown) => unknown, path = '/home/Documents') {
  return renderScreen(FilesScreen, filesHandlers({ 'files.list': list }), {
    path: '/files',
    entries: [`/files?path=${encodeURIComponent(path)}`],
  });
}

afterEach(() => vi.useRealTimers());

describe('US-FILE-24', () => {
  it('after 150 ms shows 12 skeleton items labelled "Loading files"; the breadcrumb and toolbar stay usable', async () => {
    open(() => new Promise(() => {}));
    const loading = await screen.findByRole('status', { name: 'Loading files' });
    expect(loading).toHaveAttribute('aria-busy', 'true');
    await waitFor(() => expect(loading.querySelectorAll('.hl-skeleton').length).toBe(36));
    // 12 items, each an icon and two lines.
    expect(loading.querySelectorAll('.hl-skeleton').length / 3).toBe(12);
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(crumbs).toHaveTextContent('HomeDocuments');
    expect(screen.getByRole('button', { name: 'New folder' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
  });

  it('shows nothing for the first 150 ms, and "Still loading…" after 10 s', () => {
    vi.useFakeTimers();
    render(<FolderSkeleton />);
    const status = screen.getByRole('status', { name: 'Loading files' });
    expect(status.querySelectorAll('.hl-skeleton')).toHaveLength(0);
    act(() => vi.advanceTimersByTime(SKELETON_AFTER_MS));
    expect(status.querySelectorAll('.hl-skeleton')).toHaveLength(36);
    expect(screen.queryByText('Still loading… this drive is slow to respond')).toBeNull();
    act(() => vi.advanceTimersByTime(SLOW_AFTER_MS));
    expect(screen.getByText('Still loading… this drive is slow to respond')).toBeInTheDocument();
  });

  it('list view has 8 skeleton rows', () => {
    vi.useFakeTimers();
    render(<FolderSkeleton view="list" />);
    act(() => vi.advanceTimersByTime(SKELETON_AFTER_MS));
    const rows = screen.getByRole('status').querySelectorAll('.grid');
    expect(rows).toHaveLength(8);
  });

  it("skeletons don't shimmer when motion is reduced (the OS setting or hlabs's)", () => {
    const css = readFileSync('../../packages/ui/src/styles/components.css', 'utf8');
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*:root:not\(\[data-motion='full'\]\) \.hl-skeleton \{\s*animation: none;/,
    );
    expect(css).toMatch(/\[data-motion='reduced'\] \.hl-skeleton \{\s*animation: none;/);
  });

  it('a folder already loaded shows at once when you come back, and refreshes quietly', async () => {
    let calls = 0;
    const bills = folder('/home/Documents/Bills', {
      crumbs: [...documents.crumbs, { path: '/home/Documents/Bills', name: 'Bills' }],
    });
    const { router } = open((input) => {
      calls += 1;
      return (input as { path: string }).path === '/home/Documents' ? documents : bills;
    });
    await screen.findByRole('group', { name: 'Documents' });
    await act(() => router.navigate({ to: '/files', search: { path: '/home/Documents/Bills' } }));
    await screen.findByText('This folder is empty');
    await act(() => router.navigate({ to: '/files', search: { path: '/home/Documents' } }));
    // Straight away, without a skeleton.
    expect(screen.getByRole('group', { name: 'Documents' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading files' })).toBeNull();
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('a failed load says "Couldn\'t load this folder" with Try again', async () => {
    let fail = true;
    open(() => {
      if (fail) throw daemonError('INTERNAL');
      return documents;
    });
    expect(await screen.findByText("Couldn't load this folder")).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('group', { name: 'Documents' })).toBeInTheDocument();
  });

  it('an empty folder says so, and how to fill it only where you can write', async () => {
    const { unmount } = open(() => folder('/home/Empty', { crumbs: [{ path: '/home', name: null }] }), '/home/Empty');
    expect(await screen.findByText('This folder is empty')).toBeInTheDocument();
    expect(screen.getByText('Drop files here or use Upload')).toBeInTheDocument();
    unmount();
    open(
      () => folder('/appdata/immich', { place: { area: 'app', name: 'Immich', readOnly: true } }),
      '/appdata/immich',
    );
    const empty = await screen.findByText('This folder is empty');
    expect(within(empty.parentElement!).queryByText('Drop files here or use Upload')).toBeNull();
  });

  it('names the breadcrumb from what is known while loading, and guesses read-only places', () => {
    const known = new Map<string, string | null>([['/drives/nas', 'NAS · Media']]);
    expect(provisionalCrumbs('/drives/nas/Movies', known)).toEqual([
      { path: '/drives', name: null },
      { path: '/drives/nas', name: 'NAS · Media' },
      { path: '/drives/nas/Movies', name: 'Movies' },
    ]);
    expect(provisionalReadOnly('/appdata/immich')).toBe(true);
    expect(provisionalReadOnly('/home/Documents')).toBe(false);
  });
});
