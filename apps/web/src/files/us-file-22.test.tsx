// US-FILE-22 · Move items to another folder: "Move 2 items to…" with a tree from Home opened at the current folder
// ("current"), "Move to <folder>" off for the current folder and the moved folders; a move done at once says so with
// Undo; names already there ask Skip / Keep both / Replace; a move between disks shows a bar that follows its job.
import type * as Shared from '@hlabs/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { daemonError, renderScreen } from '../test/render';
import { filesHandlers, folder } from '../test/files';
import { FilesScreen } from './files-page';
import { ancestorsOf, blockedTarget } from './move-dialog';

vi.mock('@hlabs/shared', async (importOriginal) => {
  const shared = await importOriginal<typeof Shared>();
  return { ...shared, isFeatureEnabled: (f: never, p = 5) => shared.isFeatureEnabled(f, p) };
});

const entry = (path: string, kind: 'file' | 'folder' = 'file') => ({
  name: path.slice(path.lastIndexOf('/') + 1),
  path,
  kind,
  size: kind === 'file' ? 1000 : null,
  childCount: kind === 'folder' ? 1 : null,
  modifiedAt: 1,
  mime: null,
  previewUrl: null,
});
const CRUMBS = [
  { path: '/home', name: null },
  { path: '/home/Documents', name: 'Documents' },
];
const LISTINGS: Record<string, string[]> = {
  '/home': ['/home/Documents', '/home/Photos'],
  '/home/Documents': ['/home/Documents/Old', '/home/Documents/Taxes', '/home/Documents/a.pdf', '/home/Documents/b.pdf'],
  '/home/Documents/Old': [],
  '/home/Documents/Taxes': [],
};

function open(move: (input: unknown) => unknown, events?: Promise<unknown>) {
  return renderScreen(
    FilesScreen,
    filesHandlers({
      'files.list': (i) => {
        const { path, kinds } = i as { path: string; kinds?: string[] };
        const all = (LISTINGS[path] ?? []).map((p) => entry(p, p.endsWith('.pdf') ? 'file' : 'folder'));
        const items = kinds ? all.filter((e) => e.kind === 'folder') : all;
        return folder(path, { crumbs: CRUMBS, items, count: items.length });
      },
      'files.move': move,
      ...(events ? { 'events.stream': () => events } : {}),
    }),
    { path: '/files', entries: ['/files?path=%2Fhome%2FDocuments'] },
  );
}

async function chooseMove(names: RegExp[]) {
  await screen.findByRole('group', { name: 'Documents' });
  for (const [i, n] of names.entries()) fireEvent.click(screen.getByRole('button', { name: n }), { metaKey: i > 0 });
  fireEvent.click(within(screen.getByRole('toolbar', { name: /selected/ })).getByRole('button', { name: 'Move to…' }));
  return screen.findByRole('dialog', { name: names.length === 1 ? /^Move “/ : `Move ${names.length} items to…` });
}

const moveCalls = (calls: Array<{ path: string; input: unknown }>) =>
  calls.filter((c) => c.path === 'files.move').map((c) => c.input);

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-FILE-22', () => {
  it('works out where items can go', () => {
    expect(ancestorsOf('/home/Documents/Bills')).toEqual(['/home', '/home/Documents', '/home/Documents/Bills']);
    const moving = [entry('/home/Documents/Old', 'folder'), entry('/home/Documents/a.pdf')];
    expect(blockedTarget('/home/Documents', '/home/Documents', moving)).toBe(true);
    expect(blockedTarget('/home/Documents/Old', '/home/Documents', moving)).toBe(true);
    expect(blockedTarget('/home/Documents/Old/Inner', '/home/Documents', moving)).toBe(true);
    expect(blockedTarget('/home/Documents/Taxes', '/home/Documents', moving)).toBe(false);
  });

  it('the tree opens at the current folder; "Move to" is off for it and for a moved folder', async () => {
    open(() => ({ done: true, moved: [] }));
    const dialog = await chooseMove([/^Old/, /^a\.pdf/]);
    const tree = within(dialog).getByRole('tree', { name: 'Folders' });
    const documents = await within(tree).findByRole('treeitem', { name: /^Documents/ });
    expect(documents).toHaveTextContent('current');
    expect(await within(tree).findByRole('treeitem', { name: 'Taxes' })).toBeInTheDocument();
    expect(within(tree).getByRole('treeitem', { name: 'Photos' })).toBeInTheDocument();
    fireEvent.click(documents);
    expect(within(dialog).getByRole('button', { name: 'Move to Documents' })).toBeDisabled();
    fireEvent.click(within(tree).getByRole('treeitem', { name: 'Old' }));
    expect(within(dialog).getByRole('button', { name: 'Move to Old' })).toBeDisabled();
    fireEvent.click(within(tree).getByRole('treeitem', { name: 'Taxes' }));
    expect(within(dialog).getByRole('button', { name: 'Move to Taxes' })).toBeEnabled();
  });

  it('moves at once and says so with Undo, which moves them back', async () => {
    const { calls } = open((i) => {
      const { paths, to } = i as { paths: string[]; to: string };
      return { done: true, moved: paths.map((p) => ({ from: p, to: `${to}/${p.slice(p.lastIndexOf('/') + 1)}` })) };
    });
    const dialog = await chooseMove([/^a\.pdf/, /^b\.pdf/]);
    fireEvent.click(await within(dialog).findByRole('treeitem', { name: 'Taxes' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move to Taxes' }));
    await waitFor(() => expect(currentToasts().map((t) => t.title)).toContain('Moved 2 items to Taxes'));
    expect(moveCalls(calls)[0]).toEqual({
      paths: ['/home/Documents/a.pdf', '/home/Documents/b.pdf'],
      to: '/home/Documents/Taxes',
      conflicts: {},
    });
    const toast = currentToasts().find((t) => t.title === 'Moved 2 items to Taxes')!;
    const undo = toast.actions![0]!;
    expect(undo.label).toBe('Undo');
    act(() => (undo as { run: () => void }).run());
    await waitFor(() =>
      expect(moveCalls(calls)[1]).toEqual({
        paths: ['/home/Documents/Taxes/a.pdf', '/home/Documents/Taxes/b.pdf'],
        to: '/home/Documents',
      }),
    );
  });

  it('asks about a name already there, with the uploads’ choices', async () => {
    const { calls } = open((i) => {
      if (!(i as { conflicts?: Record<string, string> }).conflicts?.['a.pdf'])
        throw daemonError('FILES_NAME_EXISTS', { names: ['a.pdf'] });
      return { done: true, moved: [] };
    });
    const dialog = await chooseMove([/^a\.pdf/]);
    fireEvent.click(await within(dialog).findByRole('treeitem', { name: 'Taxes' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move to Taxes' }));
    const conflict = await screen.findByRole('dialog', { name: '“a.pdf” already exists in Taxes' });
    fireEvent.click(within(conflict).getByRole('button', { name: 'Keep both' }));
    await waitFor(() => expect(moveCalls(calls)[1]).toMatchObject({ conflicts: { 'a.pdf': 'keepBoth' } }));
  });

  it('a move between disks shows a bar that follows its job', async () => {
    let send!: (event: unknown) => void;
    const events = new Promise((resolve) => (send = resolve));
    open(() => ({ jobId: 'j1' }), events);
    const dialog = await chooseMove([/^a\.pdf/, /^b\.pdf/]);
    fireEvent.click(await within(dialog).findByRole('treeitem', { name: 'Taxes' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move to Taxes' }));
    await waitFor(() =>
      expect(currentToasts().find((t) => t.title === 'Moving 2 items to Taxes')).toMatchObject({ progress: 0 }),
    );
    send({
      id: 'e1',
      data: {
        type: 'job.progress',
        data: { jobId: 'j1', kind: 'files_move', target: null, progress: 40, message: null },
      },
    });
    await waitFor(() =>
      expect(currentToasts().find((t) => t.title === 'Moving 2 items to Taxes')).toMatchObject({ progress: 40 }),
    );
  });

  it('dragging items onto a folder moves them there', async () => {
    const { calls } = open(() => ({ done: true, moved: [] }));
    await screen.findByRole('group', { name: 'Documents' });
    const types: string[] = [];
    const dataTransfer = {
      types,
      setData: (t: string) => types.push(t),
      effectAllowed: 'all',
      dropEffect: 'none',
    };
    const tile = (name: RegExp) => screen.getByRole('button', { name }).parentElement!;
    fireEvent.dragStart(tile(/^a\.pdf/), { dataTransfer });
    fireEvent.dragOver(tile(/^Taxes/), { dataTransfer });
    fireEvent.drop(tile(/^Taxes/), { dataTransfer });
    await waitFor(() =>
      expect(moveCalls(calls)[0]).toMatchObject({ paths: ['/home/Documents/a.pdf'], to: '/home/Documents/Taxes' }),
    );
  });
});
