// US-FILE-16 · Move items to Trash with undo: "Move to Trash" (or Delete/Backspace) sends them to the Trash and a
// toast says "<n> items moved to Trash" with Undo for 8 s; on a network drive "Delete <n> items for good?" asks first
// and deletes for good; a read-only place offers neither.
import type * as Shared from '@hlabs/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { renderScreen } from '../test/render';
import { filesHandlers, folder } from '../test/files';
import { FilesScreen } from './files-page';

vi.mock('@hlabs/shared', async (importOriginal) => {
  const shared = await importOriginal<typeof Shared>();
  return { ...shared, isFeatureEnabled: (f: never, p = 5) => shared.isFeatureEnabled(f, p) };
});

const entry = (dir: string, name: string) => ({
  name,
  path: `${dir}/${name}`,
  kind: 'file',
  size: 1000,
  childCount: null,
  modifiedAt: 1,
  mime: null,
  previewUrl: null,
});

function open(dir: string, place: { area: string; name: string | null; readOnly: boolean }) {
  return renderScreen(
    FilesScreen,
    filesHandlers({
      'files.list': () =>
        folder(dir, {
          crumbs: [{ path: dir, name: 'Here' }],
          place,
          items: [entry(dir, 'a.pdf'), entry(dir, 'b.pdf')],
          count: 2,
        }),
      'files.trash': (i) => ({ trashItemIds: (i as { paths: string[] }).paths.map((_, n) => `t${n}`) }),
      'files.delete': () => ({ ok: true }),
      'files.restoreFromTrash': () => ({ restored: [], failed: [] }),
    }),
    { path: '/files', entries: [`/files?path=${encodeURIComponent(dir)}`] },
  );
}

const callsTo = (calls: Array<{ path: string; input: unknown }>, path: string) =>
  calls.filter((c) => c.path === path).map((c) => c.input);

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-FILE-16', () => {
  it('Move to Trash sends the selection to the Trash; the toast offers Undo for 8 s', async () => {
    const { calls } = open('/home/Documents', { area: 'home', name: 'Hari', readOnly: false });
    await screen.findByRole('group', { name: 'Here' });
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: /^a\.pdf/ }));
    fireEvent.click(screen.getByRole('button', { name: /^b\.pdf/ }));
    fireEvent.click(
      within(screen.getByRole('toolbar', { name: /selected/ })).getByRole('button', { name: 'Move to Trash' }),
    );
    await waitFor(() => expect(currentToasts().map((t) => t.title)).toContain('2 items moved to Trash'));
    expect(callsTo(calls, 'files.trash')).toEqual([{ paths: ['/home/Documents/a.pdf', '/home/Documents/b.pdf'] }]);
    const toast = currentToasts().find((t) => t.title === '2 items moved to Trash')!;
    expect(toast.durationMs).toBe(8000);
    act(() => (toast.actions![0] as { run: () => void }).run());
    await waitFor(() => expect(callsTo(calls, 'files.restoreFromTrash')).toEqual([{ ids: ['t0', 't1'] }]));
  });

  it('Delete or Backspace on an item moves it to the Trash', async () => {
    const { calls } = open('/home/Documents', { area: 'home', name: 'Hari', readOnly: false });
    await screen.findByRole('group', { name: 'Here' });
    const a = screen.getByRole('button', { name: /^a\.pdf/ });
    a.focus();
    fireEvent.keyDown(a, { key: 'Backspace' });
    await waitFor(() => expect(callsTo(calls, 'files.trash')).toEqual([{ paths: ['/home/Documents/a.pdf'] }]));
    expect(currentToasts().map((t) => t.title)).toContain('“a.pdf” moved to Trash');
  });

  it('on a network drive it asks "Delete 2 items for good?" and deletes for good', async () => {
    const { calls } = open('/drives/nas/Movies', { area: 'drive', name: 'NAS · Media', readOnly: false });
    await screen.findByRole('group', { name: 'Here' });
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: /^a\.pdf/ }));
    fireEvent.click(screen.getByRole('button', { name: /^b\.pdf/ }));
    fireEvent.click(
      within(screen.getByRole('toolbar', { name: /selected/ })).getByRole('button', { name: 'Move to Trash' }),
    );
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 2 items for good?' });
    expect(dialog).toHaveTextContent(
      "They're on NAS · Media, and Trash only covers this computer, so they're deleted straight away. You can't undo this.",
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(callsTo(calls, 'files.delete')).toEqual([
        { paths: ['/drives/nas/Movies/a.pdf', '/drives/nas/Movies/b.pdf'] },
      ]),
    );
    expect(callsTo(calls, 'files.trash')).toEqual([]);
  });

  it('a read-only place offers no Move to Trash', async () => {
    const { calls } = open('/appdata/immich', { area: 'app', name: 'Immich', readOnly: true });
    await screen.findByRole('group', { name: 'Here' });
    const a = screen.getByRole('button', { name: /^a\.pdf/ });
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(a);
    expect(
      within(screen.getByRole('toolbar', { name: /selected/ })).queryByRole('button', { name: 'Move to Trash' }),
    ).toBeNull();
    a.focus();
    fireEvent.keyDown(a, { key: 'Delete' });
    expect(callsTo(calls, 'files.trash')).toEqual([]);
  });
});
