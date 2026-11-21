// US-FILE-18 · Empty Trash manually and automatically: "Empty trash" asks "Empty trash?" with how many items and how
// much, Cancel changes nothing, confirming empties this person's Trash and says so; an empty Trash turns it off.
import type * as Shared from '@hlabs/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { renderScreen } from '../test/render';
import { filesHandlers } from '../test/files';
import { FilesScreen } from './files-page';

vi.mock('@hlabs/shared', async (importOriginal) => {
  const shared = await importOriginal<typeof Shared>();
  return { ...shared, isFeatureEnabled: (f: never, p = 5) => shared.isFeatureEnabled(f, p) };
});

const item = (id: string) => ({
  id,
  name: `${id}.pdf`,
  kind: 'file',
  mime: null,
  size: 1_000_000,
  originalPath: `/home/${id}.pdf`,
  from: ['Home'],
  deletedAt: Date.now(),
});

function open(items: unknown[]) {
  let left = items;
  return renderScreen(
    FilesScreen,
    filesHandlers({
      'files.listTrash': () => ({ items: left, nextCursor: null }),
      'files.emptyTrash': () => {
        left = [];
        return { ok: true };
      },
    }),
    { path: '/files', entries: ['/files?view=trash'] },
  );
}

const empties = (calls: Array<{ path: string; input: unknown }>) => calls.filter((c) => c.path === 'files.emptyTrash');

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-FILE-18', () => {
  it('asks "Empty trash?" with how many and how much; Cancel changes nothing', async () => {
    const { calls } = open([item('a'), item('b')]);
    await screen.findByRole('button', { name: 'Restore a.pdf' });
    fireEvent.click(screen.getByRole('button', { name: 'Empty trash' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Empty trash?' });
    expect(dialog).toHaveTextContent("2 items (2 MB) will be deleted for good. You can't undo this.");
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(empties(calls)).toEqual([]);
  });

  it('confirming empties the Trash and says so', async () => {
    const { calls } = open([item('a'), item('b')]);
    await screen.findByRole('button', { name: 'Restore a.pdf' });
    fireEvent.click(screen.getByRole('button', { name: 'Empty trash' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Empty trash?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Empty trash' }));
    await waitFor(() => expect(currentToasts().map((t) => t.title)).toContain('Trash emptied'));
    expect(empties(calls).map((c) => c.input)).toEqual([{}]);
    expect(await screen.findByText('Trash is empty')).toBeInTheDocument();
  });

  it('an empty Trash turns Empty trash off', async () => {
    open([]);
    await screen.findByText('Trash is empty');
    expect(screen.getByRole('button', { name: 'Empty trash' })).toBeDisabled();
  });
});
