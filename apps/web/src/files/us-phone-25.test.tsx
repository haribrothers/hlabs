// US-PHONE-25 · Files on the phone in the new design (D-172, D-174): the bar with "+" and "Select" over the large
// "Files" title, the search field, the places as chips, the breadcrumb and the folder as an inset list with "•••" on
// every row; the actions sheet (grabber, Open and Download tiles, the actions as rows); selecting with "Select all ·
// N selected · Done" and the bar in the tab bar's place; Move to as a full-height sheet with Cancel in its bar; Rename
// as a sheet with the name selected up to its extension; Trash with Restore all and Empty trash. Layout only.
import type { FileEntry } from '@hlabs/api';
import type * as Shared from '@hlabs/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { filesHandlers, folder } from '../test/files';
import { phoneViewport } from '../test/phone';
import { FilesScreen } from './files-page';

vi.mock('@hlabs/shared', async (importOriginal) => {
  const shared = await importOriginal<typeof Shared>();
  return { ...shared, isFeatureEnabled: (f: never, p = 5) => shared.isFeatureEnabled(f, p) };
});

const entry = (name: string, kind: 'file' | 'folder' = 'file') =>
  ({
    name,
    path: `/home/Documents/${name}`,
    kind,
    size: kind === 'file' ? 1_200_000 : null,
    childCount: kind === 'folder' ? 24 : null,
    modifiedAt: Date.now(),
    mime: name.endsWith('.pdf') ? 'application/pdf' : null,
    previewUrl: null,
  }) as FileEntry;

function open() {
  const names = ['Bills', 'Taxes', 'Lease agreement.pdf', 'Budget 2026.xlsx'];
  return renderScreen(
    FilesScreen,
    filesHandlers({
      'files.list': (input) => {
        const path = (input as { path: string }).path;
        if (path !== '/home/Documents') return folder(path);
        return folder(path, {
          crumbs: [
            { path: '/home', name: null },
            { path: '/home/Documents', name: 'Documents' },
          ],
          items: names.map((n) => entry(n, n.includes('.') ? 'file' : 'folder')),
          count: names.length,
          filesBytes: 1_200_084,
        });
      },
    }),
    { path: '/files', entries: ['/files?path=%2Fhome%2FDocuments'] },
  );
}

let restore: () => void;
beforeEach(() => {
  restore = phoneViewport();
});
afterEach(() => restore());

describe('US-PHONE-25', () => {
  it('Files: "+" and Select in the bar, the large title, search, chips, breadcrumb and an inset list with •••', async () => {
    open();
    const list = await screen.findByRole('group', { name: 'Documents' });
    expect(list).toHaveClass('hl-p-group');
    // The large title is drawn; the open folder is the page's heading.
    expect(document.querySelector('.hl-p-large')).toHaveTextContent('Files');
    expect(screen.getByRole('heading', { level: 1, name: 'Documents' })).toBeInTheDocument();
    const nav = document.querySelector<HTMLElement>('.hl-p-files-nav')!;
    expect(within(nav).getByRole('button', { name: 'Add to this folder' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Select' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search files' })).toHaveAttribute(
      'placeholder',
      'Search in Documents',
    );
    const places = screen.getByRole('navigation', { name: 'Places' });
    expect(within(places).getByRole('link', { name: 'Home' })).toHaveClass('hl-p-chip');
    expect(within(places).getByRole('link', { name: 'Trash' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveClass('hl-p-crumbs');
    for (const name of ['Bills', 'Taxes', 'Lease agreement.pdf', 'Budget 2026.xlsx'])
      expect(within(list).getByRole('button', { name: `More for ${name}` })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Bills, folder' })).toHaveTextContent('24 items');
    expect(within(list).getByRole('button', { name: /^Lease agreement\.pdf, / })).toHaveTextContent('1.2 MB · Today');
    expect(screen.getByText('4 items · 1.2 MB')).toBeInTheDocument();
  });

  it('"+" opens a sheet with New folder and Upload', async () => {
    open();
    await screen.findByRole('group', { name: 'Documents' });
    fireEvent.click(screen.getByRole('button', { name: 'Add to this folder' }));
    const sheet = await screen.findByRole('dialog', { name: 'Add to this folder' });
    expect(sheet.querySelector('.hl-sheet-handle')).not.toBeNull();
    expect(within(sheet).getByRole('button', { name: 'Upload' })).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'New folder' }));
    expect(await screen.findByRole('dialog', { name: 'New folder' })).toBeInTheDocument();
  });

  it('••• opens the actions sheet: grabber, the item and ✕, Open and Download tiles, the actions as rows', async () => {
    open();
    await screen.findByRole('group', { name: 'Documents' });
    fireEvent.click(screen.getByRole('button', { name: 'More for Lease agreement.pdf' }));
    const sheet = await screen.findByRole('dialog', { name: 'Lease agreement.pdf' });
    expect(sheet.querySelector('.hl-sheet-handle')).not.toBeNull();
    expect(sheet.querySelector('.hl-sheet-head')).toHaveTextContent('1.2 MB · Today');
    expect(within(sheet).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    const tiles = [...sheet.querySelectorAll('.hl-p-action')].map((t) => t.textContent);
    expect(tiles).toEqual(expect.arrayContaining(['Open', 'Download']));
    for (const name of ['Open with', 'Copy link', 'Rename…', 'Move to…', 'Duplicate'])
      expect(within(sheet).getByRole('button', { name })).toHaveClass('hl-p-row');
    expect(within(sheet).getByRole('button', { name: 'Move to Trash' })).toHaveClass('hl-p-row-danger');
  });

  it('Rename is a sheet with Cancel in its bar and the name selected up to its extension', async () => {
    open();
    await screen.findByRole('group', { name: 'Documents' });
    fireEvent.click(screen.getByRole('button', { name: 'More for Lease agreement.pdf' }));
    const actions = await screen.findByRole('dialog', { name: 'Lease agreement.pdf' });
    fireEvent.click(within(actions).getByRole('button', { name: 'Rename…' }));
    const sheet = await screen.findByRole('dialog', { name: 'Rename' });
    const bar = sheet.querySelector<HTMLElement>('.hl-sheet-bar')!;
    expect(within(bar).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    const field = within(sheet).getByRole('textbox', { name: 'New name' }) as HTMLInputElement;
    await waitFor(() => expect(field).toHaveFocus());
    expect(field.value).toBe('Lease agreement');
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 'Lease agreement'.length]);
    expect(sheet).toHaveTextContent('The .pdf ending is kept');
    expect(within(sheet).getAllByRole('button', { name: 'Rename' })).toHaveLength(1);
  });

  it('Select: "Select all · N selected · Done" and the selection bar in the tab bar’s place; Move to is a full sheet', async () => {
    open();
    await screen.findByRole('group', { name: 'Documents' });
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Select all' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^More for/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Lease agreement\.pdf, / }));
    fireEvent.click(screen.getByRole('button', { name: /^Budget 2026\.xlsx, / }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    const bar = screen.getByRole('toolbar', { name: '2 items selected' });
    expect(bar.closest('.hl-p-selbar')).not.toBeNull();
    expect(within(bar).getByRole('button', { name: 'Move' })).toBeInTheDocument();
    expect(within(bar).getByRole('link', { name: 'Download' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Trash' })).toBeInTheDocument();
    expect(document.documentElement.dataset.tabBarHidden).toBe('true');

    fireEvent.click(within(bar).getByRole('button', { name: 'Move' }));
    const move = await screen.findByRole('dialog', { name: 'Move 2 items to…' });
    expect(move).toHaveClass('hl-sheet-full');
    expect(
      within(move.querySelector<HTMLElement>('.hl-sheet-bar')!).getByRole('button', { name: 'Cancel' }),
    ).toBeInTheDocument();
    expect(within(move).getByRole('tree', { name: 'Folders' })).toHaveClass('hl-p-group');
    expect(within(move).getByRole('button', { name: 'New folder' })).toBeInTheDocument();
    expect(within(move).getByRole('button', { name: 'Move to…' })).toBeDisabled();
    fireEvent.click(within(move.querySelector<HTMLElement>('.hl-sheet-bar')!).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Move 2 items to…' })).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('toolbar', { name: /selected/ })).toBeNull());
    expect(document.documentElement.dataset.tabBarHidden).toBeUndefined();
  });

  it('Trash: the title with Restore all and Empty trash, the note, and rows that restore with a round button', async () => {
    renderScreen(
      FilesScreen,
      filesHandlers({
        'files.listTrash': () => ({
          items: [
            {
              id: 't1',
              name: 'Old lease.pdf',
              kind: 'file',
              mime: null,
              size: 1000,
              originalPath: '/home/Documents/Old lease.pdf',
              from: ['Documents'],
              deletedAt: Date.now() - 2 * 86_400_000,
            },
            {
              id: 't2',
              name: 'Notes 2025.txt',
              kind: 'file',
              mime: null,
              size: 1000,
              originalPath: '/home/Notes 2025.txt',
              from: ['Home'],
              deletedAt: Date.now() - 26 * 86_400_000,
            },
          ],
          nextCursor: null,
        }),
      }),
      { path: '/files', entries: ['/files?view=trash'] },
    );
    const list = await screen.findByRole('list', { name: 'Trash' });
    expect(list).toHaveClass('hl-p-group');
    expect(screen.getByRole('heading', { level: 1, name: 'Trash' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore all' })).toHaveClass('hl-p-tlink');
    expect(screen.getByRole('button', { name: 'Empty trash' })).toHaveAttribute('data-danger');
    expect(screen.getByText('Items are deleted for good after 30 days.')).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Restore Old lease.pdf' })).toHaveClass('hl-p-round');
    expect(within(list).getByText(/^[1-7] days? left$/)).toHaveClass('text-warning');
    expect(screen.getByRole('link', { name: 'Trash' })).toHaveAttribute('aria-current', 'page');
  });
});
