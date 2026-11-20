// US-FILE-20 · Select several items: click selects one, Cmd/Ctrl-click toggles, Shift-click selects a range, a
// "Select <name>" tick on each item, Cmd/Ctrl+A selects all; the selection bar ("<n> selected", Share, Download, ✕);
// the footer's "<n> items · <k> selected · <size>" and the Shift-click hint; Esc or ✕ clears; Share uses the share
// sheet for files only; opening another folder clears; a phone's Select mode with its bar in the tab bar's place.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { filesHandlers, folder } from '../test/files';
import { FilesScreen } from './files-page';
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

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  // @ts-expect-error tests put matchMedia and canShare in for some cases
  delete window.matchMedia;
  // @ts-expect-error see above
  delete navigator.canShare;
});

describe('US-FILE-20', () => {
  it('selects with a click, Cmd/Ctrl-click and Shift-click, and Cmd/Ctrl+A', () => {
    const order = ['/a', '/b', '/c', '/d'];
    let s = clickSelect(emptySelection('/'), order, '/b');
    expect(s.paths).toEqual(['/b']);
    s = clickSelect(s, order, '/d', { toggle: true });
    expect(s.paths).toEqual(['/b', '/d']);
    s = clickSelect(s, order, '/b', { toggle: true });
    expect(s.paths).toEqual(['/d']);
    // The range runs from the last item clicked (b) to the Shift-clicked one.
    expect(clickSelect(s, order, '/a', { range: true }).paths).toEqual(['/a', '/b']);
    s = clickSelect(s, order, '/d', { range: true });
    expect(s.paths).toEqual(['/b', '/c', '/d']);
    expect(toggleSelect(s, '/c').paths).toEqual(['/b', '/d']);
    expect(selectAll(emptySelection('/'), order).paths).toEqual(order);
  });

  it('in the grid: click, Cmd-click, Shift-click, ticks and Cmd+A; the bar and footer say what is selected', async () => {
    open();
    await screen.findByRole('group', { name: 'Documents' });
    fireEvent.click(item(/^a\.pdf/));
    expect(item(/^a\.pdf/)).toHaveAttribute('aria-selected', 'true');
    expect(within(bar()!).getByText('1 selected')).toBeInTheDocument();
    fireEvent.click(item(/^c\.pdf/), { metaKey: true });
    expect(screen.getByText('4 items · 2 selected · 4 MB')).toBeInTheDocument();
    expect(screen.getByText('Shift-click to select a range')).toBeInTheDocument();
    fireEvent.click(item(/^Bills/), { shiftKey: true });
    expect(within(bar()!).getByText('4 selected')).toBeInTheDocument();
    // Every item has its own tick.
    const tick = screen.getByRole('checkbox', { name: 'Select b.pdf' });
    expect(tick).toBeChecked();
    fireEvent.click(tick);
    expect(within(bar()!).getByText('3 selected')).toBeInTheDocument();
    fireEvent.keyDown(item(/^a\.pdf/), { key: 'a', ctrlKey: true });
    expect(within(bar()!).getByText('4 selected')).toBeInTheDocument();
  });

  it('Download fetches the selected items together; ✕ or Esc clears, and Esc stays in Files', async () => {
    const { router } = open();
    await screen.findByRole('group', { name: 'Documents' });
    fireEvent.click(item(/^a\.pdf/));
    fireEvent.click(item(/^b\.pdf/), { ctrlKey: true });
    expect(within(bar()!).getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      '/api/files/download?path=%2Fhome%2FDocuments%2Fa.pdf&path=%2Fhome%2FDocuments%2Fb.pdf',
    );
    fireEvent.click(within(bar()!).getByRole('button', { name: 'Clear selection' }));
    expect(bar()).toBeNull();
    fireEvent.click(item(/^a\.pdf/));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(bar()).toBeNull();
    expect(router.state.location.pathname).toBe('/files');
  });

  it('Share uses the share sheet for files, and is left out for folders or where files can’t be shared', async () => {
    open();
    await screen.findByRole('group', { name: 'Documents' });
    fireEvent.click(item(/^a\.pdf/));
    expect(within(bar()!).queryByRole('button', { name: 'Share' })).toBeNull();
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    fireEvent.click(item(/^b\.pdf/), { metaKey: true });
    expect(within(bar()!).getByRole('button', { name: 'Share' })).toBeInTheDocument();
    fireEvent.click(item(/^Bills/), { metaKey: true });
    expect(within(bar()!).queryByRole('button', { name: 'Share' })).toBeNull();
  });

  it('opening another folder clears the selection', async () => {
    const { router } = open();
    await screen.findByRole('group', { name: 'Documents' });
    fireEvent.click(item(/^a\.pdf/));
    expect(bar()).not.toBeNull();
    await act(() => router.navigate({ to: '/files', search: { path: '/home/Documents/Bills' } }));
    await screen.findByText('This folder is empty');
    await act(() => router.navigate({ to: '/files', search: { path: '/home/Documents' } }));
    await screen.findByRole('group', { name: 'Documents' });
    expect(bar()).toBeNull();
  });

  it('in list view each row has a "Select <name>" tick, and the rows select the same way', async () => {
    window.localStorage.setItem(VIEW_KEY, '"list"');
    open();
    const list = await screen.findByRole('grid', { name: 'Documents' });
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
    vi.spyOn(console, 'error').mockImplementation(() => {});
    open();
    await screen.findByRole('group', { name: 'Documents' });
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
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
