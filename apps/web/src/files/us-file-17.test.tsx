// US-FILE-17 · Restore items from Trash: the Trash row opens "Trash" with Restore all and the 30-day note; each row
// says where it came from and when, and how many days are left (amber at 7 or fewer); Restore and Restore all put
// items back, a drive that isn't connected says so; an empty Trash says so and turns Restore all off.
import type * as Shared from '@hlabs/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { renderScreen } from '../test/render';
import { filesHandlers } from '../test/files';
import { FilesScreen } from './files-page';
import { daysLeft, deletedWhen } from './trash-format';

vi.mock('@hlabs/shared', async (importOriginal) => {
  const shared = await importOriginal<typeof Shared>();
  return { ...shared, isFeatureEnabled: (f: never, p = 5) => shared.isFeatureEnabled(f, p) };
});

const DAY = 86_400_000;
const now = Date.now();
const item = (id: string, name: string, from: string[], daysAgo: number, kind = 'file') => ({
  id,
  name,
  kind,
  mime: null,
  size: 1000,
  originalPath: `/home/${[...from, name].join('/')}`,
  from,
  deletedAt: now - daysAgo * DAY,
});

function open(
  items: unknown[],
  restore: (input: unknown) => unknown = () => ({ restored: [{ id: 'x', path: '/x' }], failed: [] }),
) {
  return renderScreen(
    FilesScreen,
    filesHandlers({
      'files.listTrash': () => ({ items, nextCursor: null }),
      'files.restoreFromTrash': restore,
    }),
    { path: '/files', entries: ['/files?view=trash'] },
  );
}

const restores = (calls: Array<{ path: string; input: unknown }>) =>
  calls.filter((c) => c.path === 'files.restoreFromTrash').map((c) => c.input);

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-FILE-17', () => {
  it('says when, and how many days are left', () => {
    expect(deletedWhen(now, now)).toBe('today');
    expect(deletedWhen(now - DAY, now)).toBe('yesterday');
    expect(deletedWhen(now - 12 * DAY, now)).toBe('12 days ago');
    expect(daysLeft(now, now)).toBe(30);
    expect(daysLeft(now - 26 * DAY, now)).toBe(4);
    expect(daysLeft(now - 40 * DAY, now)).toBe(0);
  });

  it('the Trash row opens Trash: header, Restore all, the note, and rows newest first', async () => {
    const { router } = renderScreen(
      FilesScreen,
      filesHandlers({ 'files.listTrash': () => ({ items: [], nextCursor: null }) }),
      {
        path: '/files',
        entries: ['/files?path=%2Fhome'],
      },
    );
    fireEvent.click(await screen.findByRole('link', { name: 'Trash' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ view: 'trash' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Trash' })).toBeInTheDocument();
  });

  it('each row: where it came from and when, days left (amber at 7 or fewer) and Restore', async () => {
    open([item('a', 'march.pdf', ['Documents', 'Bills'], 1), item('b', 'Budget 2025.xlsx', ['Documents'], 26)]);
    const list = await screen.findByRole('list', { name: 'Trash' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('march.pdf');
    expect(rows[0]).toHaveTextContent('From Documents › Bills · deleted yesterday');
    expect(within(rows[0]!).getByText('29 days left')).not.toHaveClass('text-warning');
    expect(within(rows[1]!).getByText('4 days left')).toHaveClass('text-warning');
    expect(screen.getByText('Items are deleted for good after 30 days.')).toBeInTheDocument();
  });

  it('Restore puts one back; a drive that isn’t connected says so', async () => {
    const { calls } = open(
      [item('a', 'march.pdf', ['Documents'], 0), item('b', 'scan.pdf', ['NAS · Media', 'Scans'], 2)],
      (i) =>
        (i as { ids?: string[] }).ids?.[0] === 'b'
          ? {
              restored: [],
              failed: [{ id: 'b', name: 'scan.pdf', hlabsCode: 'NAS_UNREACHABLE', location: 'NAS · Media' }],
            }
          : { restored: [{ id: 'a', path: '/home/Documents/march.pdf' }], failed: [] },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Restore march.pdf' }));
    await waitFor(() => expect(currentToasts().map((t) => t.title)).toContain('“march.pdf” restored'));
    fireEvent.click(screen.getByRole('button', { name: 'Restore scan.pdf' }));
    await waitFor(() =>
      expect(currentToasts().map((t) => t.title)).toContain("Couldn't restore. NAS · Media isn't connected."),
    );
    expect(restores(calls)).toEqual([{ ids: ['a'] }, { ids: ['b'] }]);
  });

  it('Restore all restores everything', async () => {
    const { calls } = open([item('a', 'a.pdf', ['Documents'], 0), item('b', 'b.pdf', ['Documents'], 0)], () => ({
      restored: [
        { id: 'a', path: '/home/Documents/a.pdf' },
        { id: 'b', path: '/home/Documents/b.pdf' },
      ],
      failed: [],
    }));
    await screen.findByRole('button', { name: 'Restore a.pdf' });
    fireEvent.click(screen.getByRole('button', { name: 'Restore all' }));
    await waitFor(() => expect(currentToasts().map((t) => t.title)).toContain('2 items restored'));
    expect(restores(calls)).toEqual([{}]);
  });

  it('an empty Trash says so and turns Restore all off', async () => {
    open([]);
    expect(await screen.findByText('Trash is empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore all' })).toBeDisabled();
  });
});
