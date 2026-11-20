// US-FILE-23 · Rename a file or folder: F2 (or the preview's "•••") opens Rename with the name selected and the
// extension beside it, explained; folders edit the whole name; Rename or Enter renames and the item stays selected;
// Cancel or Esc changes nothing; New folder's inline errors; a folder an app uses needs "Rename anyway".
import type * as Shared from '@hlabs/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { filesHandlers, folder } from '../test/files';
import { FilesScreen } from './files-page';
import { splitName } from './rename-dialog';

vi.mock('@hlabs/shared', async (importOriginal) => {
  const shared = await importOriginal<typeof Shared>();
  return { ...shared, isFeatureEnabled: (f: never, p = 5) => shared.isFeatureEnabled(f, p) };
});

const entry = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  path: `/home/Documents/${name}`,
  kind: 'file',
  size: 1_200_000,
  childCount: null,
  modifiedAt: 1,
  mime: 'application/pdf',
  previewUrl: null,
  ...over,
});

function open(
  rename: (input: unknown) => unknown = (i) => ({ path: `/home/Documents/${(i as { name: string }).name}` }),
) {
  let names = ['Scans', 'Lease agreement.pdf'];
  const handlers = filesHandlers({
    'files.list': () =>
      folder('/home/Documents', {
        crumbs: [
          { path: '/home', name: null },
          { path: '/home/Documents', name: 'Documents' },
        ],
        items: names.map((n) =>
          n.includes('.') ? entry(n) : entry(n, { kind: 'folder', size: null, childCount: 1, mime: null }),
        ),
        count: names.length,
      }),
    'files.rename': (input) => {
      const out = rename(input);
      const i = input as { path: string; name: string };
      names = names.map((n) => (i.path.endsWith(`/${n}`) ? i.name : n));
      return out;
    },
    'files.stat': (input) => ({
      ...entry('Lease agreement.pdf'),
      path: (input as { path: string }).path,
      dimensions: null,
      parent: [],
      readOnly: false,
    }),
  });
  return renderScreen(FilesScreen, handlers, { path: '/files', entries: ['/files?path=%2Fhome%2FDocuments'] });
}

async function renameWithF2(name: RegExp) {
  await screen.findByRole('group', { name: 'Documents' });
  const item = screen.getByRole('button', { name });
  item.focus();
  fireEvent.keyDown(item, { key: 'F2' });
  return screen.findByRole('dialog', { name: 'Rename' });
}

const renameCalls = (calls: Array<{ path: string; input: unknown }>) =>
  calls.filter((c) => c.path === 'files.rename').map((c) => c.input);

describe('US-FILE-23', () => {
  it('splits a file name from its extension; folders and dotfiles keep the whole name', () => {
    expect(splitName({ name: 'Lease agreement.pdf', kind: 'file' })).toEqual({ base: 'Lease agreement', ext: '.pdf' });
    expect(splitName({ name: 'archive.tar.gz', kind: 'file' })).toEqual({ base: 'archive.tar', ext: '.gz' });
    expect(splitName({ name: 'Bills.2026', kind: 'folder' })).toEqual({ base: 'Bills.2026', ext: '' });
    expect(splitName({ name: '.env', kind: 'file' })).toEqual({ base: '.env', ext: '' });
    expect(splitName({ name: 'README', kind: 'file' })).toEqual({ base: 'README', ext: '' });
  });

  it('F2 on a file: the name without .pdf, selected, .pdf beside it and why; Enter renames and it keeps focus (D-137)', async () => {
    const { calls } = open();
    const dialog = await renameWithF2(/^Lease agreement\.pdf/);
    const field = within(dialog).getByRole('textbox', { name: 'New name' }) as HTMLInputElement;
    await waitFor(() => expect(field).toHaveFocus());
    expect(field.value).toBe('Lease agreement');
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 'Lease agreement'.length]);
    // The ending follows the typed name inside the field, not at its far edge.
    const ending = within(dialog).getByText('.pdf');
    expect(ending.closest('.hl-input-suffixed')).toBe(field.closest('.hl-input-suffixed'));
    expect(field.parentElement!.nextElementSibling).toBe(ending);
    expect(within(dialog).getByText('The .pdf ending is kept so apps still know how to open it.')).toBeInTheDocument();
    fireEvent.change(field, { target: { value: 'Lease 2026' } });
    fireEvent.submit(field.closest('form')!);
    await waitFor(() =>
      expect(renameCalls(calls)).toEqual([{ path: '/home/Documents/Lease agreement.pdf', name: 'Lease 2026.pdf' }]),
    );
    const renamed = await screen.findByRole('button', { name: /^Lease 2026\.pdf/ });
    await waitFor(() => expect(renamed).toHaveFocus());
  });

  it('a folder edits its whole name, with no line about endings', async () => {
    open();
    const dialog = await renameWithF2(/^Scans/);
    expect((within(dialog).getByRole('textbox', { name: 'New name' }) as HTMLInputElement).value).toBe('Scans');
    expect(within(dialog).queryByText(/ending is kept/)).toBeNull();
  });

  it('Cancel or Esc closes without renaming', async () => {
    const { calls } = open();
    let dialog = await renameWithF2(/^Scans/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    dialog = await renameWithF2(/^Scans/);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(renameCalls(calls)).toEqual([]);
  });

  it('an empty name, a "/" or a taken one says so inline and Rename waits', async () => {
    open(() => {
      throw daemonError('FILES_NAME_EXISTS', { name: 'Bills.pdf' });
    });
    const dialog = await renameWithF2(/^Lease agreement\.pdf/);
    const field = within(dialog).getByRole('textbox', { name: 'New name' });
    const button = within(dialog).getByRole('button', { name: 'Rename' });
    fireEvent.change(field, { target: { value: ' ' } });
    expect(within(dialog).getByText('Use a shorter name without “/”.')).toBeInTheDocument();
    expect(button).toBeDisabled();
    fireEvent.change(field, { target: { value: 'a/b' } });
    expect(button).toBeDisabled();
    fireEvent.change(field, { target: { value: 'Bills' } });
    fireEvent.click(button);
    expect(await within(dialog).findByText('A file called “Bills.pdf” already exists here.')).toBeInTheDocument();
    expect(button).toBeDisabled();
  });

  it('a folder an app uses warns first, and "Rename anyway" goes ahead', async () => {
    let tries = 0;
    const { calls } = open((i) => {
      tries += 1;
      if (!(i as { force?: boolean }).force) throw daemonError('FILES_IN_USE', { apps: ['Paperless-ngx'] });
      return { path: '/home/Documents/Letters' };
    });
    const dialog = await renameWithF2(/^Scans/);
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'New name' }), { target: { value: 'Letters' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    expect(
      await within(dialog).findByText('Paperless-ngx uses this folder. Renaming it will break that.'),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename anyway' }));
    await waitFor(() => expect(tries).toBe(2));
    expect(renameCalls(calls).at(-1)).toEqual({ path: '/home/Documents/Scans', name: 'Letters', force: true });
  });

  it('the preview’s "•••" offers Rename…', async () => {
    open();
    await screen.findByRole('group', { name: 'Documents' });
    fireEvent.click(screen.getByRole('button', { name: /^Lease agreement\.pdf/ }));
    const more = await screen.findByRole('button', { name: 'More' });
    fireEvent.pointerDown(more, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename…' }));
    expect(await screen.findByRole('dialog', { name: 'Rename' })).toBeInTheDocument();
  });
});
