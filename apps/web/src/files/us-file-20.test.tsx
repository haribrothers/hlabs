// US-FILE-20 · Select several items, as a mode (D-137): a click opens and selects nothing; "Select" in the toolbar, a
// long press or Cmd/Ctrl+A starts selecting, with a "Select <name>" tick on every item; then a click ticks one,
// Shift-click a range; the bar ("<n> selected", Select all, Share, Download, ✕) and the footer's
// "<n> items · <k> selected · <size>" with the Shift-click hint; ✕ or Esc ends it; another folder ends it; on a phone
// the bar takes the tab bar's place until Done.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
import { filesHandlers, folder } from '../test/files';
import { FilesScreen } from './files-page';
import { LONG_PRESS_MS } from './long-press';
import { clickSelect, emptySelection, selectAll, toggleSelect } from './selection';
import { VIEW_KEY } from './view-prefs';

const entry = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  path: `/home/Documents/${name}`,
  kind: 'file',
  size: 1_000_000,
  childCount: null,
  modifiedAt: 1,
  mime: 'application/pdf',
  previewUrl: null,
  ...over,
});
const documents = folder('/home/Documents', {
  crumbs: [
    { path: '/home', name: null },
    { path: '/home/Documents', name: 'Documents' },
  ],
  items: [
    entry('Bills', { kind: 'folder', size: null, childCount: 2, mime: null }),
    entry('a.pdf'),
    entry('b.pdf', { size: 2_000_000 }),
    entry('c.pdf', { size: 3_000_000 }),
  ],
  count: 4,
  filesBytes: 6_000_000,
});
const bills = folder('/home/Documents/Bills', {
  crumbs: [...documents.crumbs, { path: '/home/Documents/Bills', name: 'Bills' }],
});

function open() {
  return renderScreen(
    FilesScreen,
    filesHandlers({ 'files.list': (i) => ((i as { path: string }).path === '/home/Documents' ? documents : bills) }),
    { path: '/files', entries: ['/files?path=%2Fhome%2FDocuments'] },
  );
}

const item = (name: RegExp) => screen.getByRole('button', { name });
const bar = () => screen.queryByRole('toolbar', { name: /selected/ });
const startSelecting = () => fireEvent.click(screen.getByRole('button', { name: 'Select' }));

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  // @ts-expect-error tests put matchMedia and canShare in for some cases
  delete window.matchMedia;
  // @ts-expect-error see above
  delete navigator.canShare;
});

describe('US-FILE-20', () => {
  it('works out ticks: one, a range from the last one, and all', () => {
    const order = ['/a', '/b', '/c', '/d'];
    let s = toggleSelect(emptySelection('/'), '/b');
    expect(s.paths).toEqual(['/b']);
    s = toggleSelect(s, '/d');
    expect(s.paths).toEqual(['/b', '/d']);
    expect(clickSelect(s, order, '/b', { range: true }).paths).toEqual(['/b', '/c', '/d']);
    expect(toggleSelect(s, '/b').paths).toEqual(['/d']);
    expect(selectAll(emptySelection('/'), order).paths).toEqual(order);
  });

  it('outside Select mode a click opens and nothing is selected', async () => {
    const { router } = open();
    await screen.findByRole('group', { name: 'Documents' });
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    fireEvent.click(item(/^Bills/));
    await waitFor(() => expect(router.state.location.search).toEqual({ path: '/home/Documents/Bills' }));
    expect(bar()).toBeNull();
  });

  it('Select starts it: ticks show, a click ticks, Shift-click a range, Select all; the bar and footer say so', async () => {
    open();
    await screen.findByRole('group', { name: 'Documents' });
    startSelecting();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    expect(within(bar()!).getByText('0 selected')).toBeInTheDocument();
    fireEvent.click(item(/^a\.pdf/));
    expect(item(/^a\.pdf/)).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(item(/^c\.pdf/));
    expect(screen.getByText('4 items · 2 selected · 4 MB')).toBeInTheDocument();
    expect(screen.getByText('Shift-click to select a range')).toBeInTheDocument();
    fireEvent.click(item(/^Bills/), { shiftKey: true });
    expect(within(bar()!).getByText('4 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select b.pdf' }));
    expect(within(bar()!).getByText('3 selected')).toBeInTheDocument();
    fireEvent.click(within(bar()!).getByRole('button', { name: 'Select all' }));
    expect(within(bar()!).getByText('4 selected')).toBeInTheDocument();
  });

  it('a long press starts selecting with that item, without opening it; Cmd/Ctrl+A starts it with everything', async () => {
    const { router } = open();
    await screen.findByRole('group', { name: 'Documents' });
    const tile = item(/^Bills/).parentElement!;
    fireEvent.pointerDown(tile, { button: 0, clientX: 10, clientY: 10 });
    await act(() => new Promise((r) => setTimeout(r, LONG_PRESS_MS + 50)));
    fireEvent.pointerUp(tile);
    fireEvent.click(item(/^Bills/));
    expect(router.state.location.search).toEqual({ path: '/home/Documents' });
    expect(within(bar()!).getByText('1 selected')).toBeInTheDocument();
    fireEvent.click(within(bar()!).getByRole('button', { name: 'Clear selection' }));
    fireEvent.keyDown(item(/^a\.pdf/), { key: 'a', ctrlKey: true });
    expect(within(bar()!).getByText('4 selected')).toBeInTheDocument();
  });

  it('Download fetches the selected items together; ✕ or Esc ends selecting, and Esc stays in Files', async () => {
    const { router } = open();
    await screen.findByRole('group', { name: 'Documents' });
    startSelecting();
    fireEvent.click(item(/^a\.pdf/));
    fireEvent.click(item(/^b\.pdf/));
    expect(within(bar()!).getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      '/api/files/download?path=%2Fhome%2FDocuments%2Fa.pdf&path=%2Fhome%2FDocuments%2Fb.pdf',
    );
    fireEvent.click(within(bar()!).getByRole('button', { name: 'Clear selection' }));
    expect(bar()).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    startSelecting();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(bar()).toBeNull();
    expect(router.state.location.pathname).toBe('/files');
  });

  it('Share uses the share sheet for files, and is left out for folders or where files can’t be shared', async () => {
    open();
    await screen.findByRole('group', { name: 'Documents' });
    startSelecting();
    fireEvent.click(item(/^a\.pdf/));
    expect(within(bar()!).queryByRole('button', { name: 'Share' })).toBeNull();
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    fireEvent.click(item(/^b\.pdf/));
    expect(within(bar()!).getByRole('button', { name: 'Share' })).toBeInTheDocument();
    fireEvent.click(item(/^Bills/));
    expect(within(bar()!).queryByRole('button', { name: 'Share' })).toBeNull();
  });

  it('opening another folder ends selecting', async () => {
    const { router } = open();
    await screen.findByRole('group', { name: 'Documents' });
    startSelecting();
    fireEvent.click(item(/^a\.pdf/));
    await act(() => router.navigate({ to: '/files', search: { path: '/home/Documents/Bills' } }));
    await screen.findByText('This folder is empty');
    await act(() => router.navigate({ to: '/files', search: { path: '/home/Documents' } }));
    await screen.findByRole('group', { name: 'Documents' });
    expect(bar()).toBeNull();
  });

  it('in list view each row has a "Select <name>" tick while selecting, and Shift-click ticks a range', async () => {
    window.localStorage.setItem(VIEW_KEY, '"list"');
    open();
    const list = await screen.findByRole('grid', { name: 'Documents' });
    startSelecting();
    const row = (name: string) => within(list).getByRole('row', { name: new RegExp(`^${name}`) });
    fireEvent.click(row('a.pdf'));
    fireEvent.click(row('c.pdf'), { shiftKey: true });
    expect(row('b.pdf')).toHaveAttribute('aria-selected', 'true');
    expect(within(row('b.pdf')).getByRole('checkbox', { name: 'Select b.pdf' })).toBeChecked();
    expect(within(bar()!).getByText('3 selected')).toBeInTheDocument();
  });

  it('on a phone, Select shows ticks, a tap ticks, and the bar takes the tab bar’s place until Done', async () => {
    window.matchMedia = ((query: string) => ({
      matches: !query.includes('min-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    open();
    await screen.findByRole('group', { name: 'Documents' });
    startSelecting();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    fireEvent.click(item(/^a\.pdf/));
    fireEvent.click(item(/^c\.pdf/));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    const phoneBar = screen.getByRole('toolbar', { name: '2 items selected' });
    expect(within(phoneBar).getByRole('link', { name: 'Download' })).toBeInTheDocument();
    expect(document.documentElement.dataset.tabBarHidden).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText('4 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('toolbar', { name: /selected/ })).toBeNull());
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(document.documentElement.dataset.tabBarHidden).toBeUndefined();
  });
});
