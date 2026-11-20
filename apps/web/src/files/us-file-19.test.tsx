// US-FILE-19 · Switch to list view and sort: List view shows Name, Modified and Size (folders count their items);
// dates read "2 days ago", "3 weeks ago", "12 Sep 2026", "Aug 2026"; a header click sorts and a second one turns it
// around, with an arrow and aria-sort; the view and sort are kept per browser and the sort applies to grid view too.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { filesHandlers, folder } from '../test/files';
import { FilesScreen } from './files-page';
import { modifiedLabel } from './format';
import { SORT_KEY, VIEW_KEY } from './view-prefs';
import type * as Shared from '@hlabs/shared';

vi.mock('@hlabs/shared', async (importOriginal) => {
  const shared = await importOriginal<typeof Shared>();
  return { ...shared, isFeatureEnabled: (f: never, p = 5) => shared.isFeatureEnabled(f, p) };
});

const DAY = 86_400_000;
const now = Date.now();
const entry = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  path: `/home/Documents/${name}`,
  kind: 'file',
  size: 1_200_000,
  childCount: null,
  modifiedAt: now - 2 * DAY,
  mime: null,
  previewUrl: null,
  ...over,
});
const documents = folder('/home/Documents', {
  crumbs: [
    { path: '/home', name: null },
    { path: '/home/Documents', name: 'Documents' },
  ],
  items: [
    entry('Bills', { kind: 'folder', size: null, childCount: 24, modifiedAt: now - 2 * DAY }),
    entry('Lease agreement.pdf', { mime: 'application/pdf', modifiedAt: now - 21 * DAY }),
  ],
  count: 2,
});

function open() {
  return renderScreen(FilesScreen, filesHandlers({ 'files.list': () => documents }), {
    path: '/files',
    entries: ['/files?path=%2Fhome%2FDocuments'],
  });
}

const listCalls = (calls: Array<{ path: string; input: unknown }>) =>
  calls.filter((c) => c.path === 'files.list').map((c) => c.input as { sort?: string; dir?: string });

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe('US-FILE-19', () => {
  it('List view shows Name, Modified and Size; folders show their item count', async () => {
    open();
    await screen.findByRole('group', { name: 'Documents' });
    fireEvent.click(screen.getByRole('radio', { name: 'List view' }));
    const list = await screen.findByRole('grid', { name: 'Documents' });
    expect(
      within(list)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Name', 'Modified', 'Size']);
    const bills = within(list).getByRole('row', { name: 'Bills, folder' });
    expect(
      within(bills)
        .getAllByRole('gridcell')
        .map((c) => c.textContent),
    ).toEqual(['', 'Bills', '2 days ago', '24 items']);
    const lease = within(list).getByRole('row', { name: 'Lease agreement.pdf, 1.2 MB' });
    expect(
      within(lease)
        .getAllByRole('gridcell')
        .map((c) => c.textContent),
    ).toEqual(['', 'Lease agreement.pdf', '3 weeks ago', '1.2 MB']); // The first cell holds the tick (US-FILE-20).
    expect(window.localStorage.getItem(VIEW_KEY)).toBe('"list"');
  });

  it('writes dates as relative days and weeks, then the date, then the month', () => {
    const at = new Date(2026, 10, 20, 12).getTime();
    expect(modifiedLabel(at - 1000, at)).toBe('Today');
    expect(modifiedLabel(at - DAY, at)).toBe('Yesterday');
    expect(modifiedLabel(at - 2 * DAY, at)).toBe('2 days ago');
    expect(modifiedLabel(at - 8 * DAY, at)).toBe('1 week ago');
    expect(modifiedLabel(at - 21 * DAY, at)).toBe('3 weeks ago');
    expect(modifiedLabel(new Date(2026, 8, 12).getTime(), at)).toBe('12 Sep 2026');
    expect(modifiedLabel(new Date(2026, 3, 2).getTime(), at)).toBe('Apr 2026');
    expect(modifiedLabel(new Date(2025, 7, 30).getTime(), at)).toBe('Aug 2025');
  });

  it('a header click sorts by it, a second one turns it around; the active one has an arrow and aria-sort', async () => {
    const { calls } = open();
    await screen.findByRole('group', { name: 'Documents' });
    fireEvent.click(screen.getByRole('radio', { name: 'List view' }));
    const list = await screen.findByRole('grid', { name: 'Documents' });
    const header = (name: string) => within(list).getByRole('columnheader', { name });
    expect(header('Name')).toHaveAttribute('aria-sort', 'ascending');
    expect(header('Name').querySelector('svg')).not.toBeNull();
    expect(header('Modified')).toHaveAttribute('aria-sort', 'none');

    fireEvent.click(within(header('Modified')).getByRole('button'));
    await waitFor(() => expect(listCalls(calls).at(-1)).toMatchObject({ sort: 'modified', dir: 'desc' }));
    expect(header('Modified')).toHaveAttribute('aria-sort', 'descending');
    expect(header('Name').querySelector('svg')).toBeNull();

    fireEvent.click(within(header('Modified')).getByRole('button'));
    await waitFor(() => expect(listCalls(calls).at(-1)).toMatchObject({ sort: 'modified', dir: 'asc' }));
    expect(header('Modified')).toHaveAttribute('aria-sort', 'ascending');
    expect(JSON.parse(window.localStorage.getItem(SORT_KEY)!)).toEqual({ by: 'modified', dir: 'asc' });
  });

  it('the view and sort are kept per browser, and the sort applies to grid view too', async () => {
    window.localStorage.setItem(VIEW_KEY, '"list"');
    window.localStorage.setItem(SORT_KEY, JSON.stringify({ by: 'size', dir: 'desc' }));
    const { calls, unmount } = open();
    expect(await screen.findByRole('grid', { name: 'Documents' })).toBeInTheDocument();
    expect(listCalls(calls)[0]).toMatchObject({ sort: 'size', dir: 'desc' });
    unmount();
    window.localStorage.setItem(VIEW_KEY, '"grid"');
    const again = open();
    expect(await screen.findByRole('group', { name: 'Documents' })).toBeInTheDocument();
    expect(listCalls(again.calls)[0]).toMatchObject({ sort: 'size', dir: 'desc' });
  });

  it('Enter or a double-click on a row opens it; the arrow keys move between rows', async () => {
    window.localStorage.setItem(VIEW_KEY, '"list"');
    const { router } = open();
    const list = await screen.findByRole('grid', { name: 'Documents' });
    const bills = within(list).getByRole('row', { name: 'Bills, folder' });
    expect(bills.tabIndex).toBe(0);
    bills.focus();
    fireEvent.keyDown(bills, { key: 'ArrowDown' });
    expect(within(list).getByRole('row', { name: 'Lease agreement.pdf, 1.2 MB' })).toHaveFocus();
    fireEvent.doubleClick(bills);
    await waitFor(() => expect(router.state.location.search).toEqual({ path: '/home/Documents/Bills' }));
  });
});
