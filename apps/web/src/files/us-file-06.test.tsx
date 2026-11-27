// US-FILE-06 · Preview a file (and US-FILE-05's Download): opening a file shows it over the window with its name,
// Download and Close preview; Previous/Next and Left/Right move through the folder's files; Escape closes and focus
// returns to the file; details; other kinds say there's no preview; an expired text link is renewed quietly.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { filesHandlers, folder } from '../test/files';
import { renderScreen } from '../test/render';
import { FilesScreen } from './files-page';
import { formatDay, previewKind } from './file-preview';

afterEach(() => vi.unstubAllGlobals());

const file = (name: string, mime: string | null, size = 3_400_000) => ({
  name,
  path: `/home/Documents/${name}`,
  kind: 'file',
  size,
  childCount: null,
  modifiedAt: new Date(2026, 8, 12, 10).getTime(),
  mime,
  previewUrl: null,
});
const items = [
  { ...file('Bills', null), kind: 'folder', size: null, childCount: 3 },
  file('Kitchen plan.jpg', 'image/jpeg'),
  file('Budget 2026.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 84_000),
  file('notes.txt', 'text/plain', 20),
];

function open(over: Record<string, (input: unknown) => unknown> = {}) {
  let links = 0;
  const result = renderScreen(
    FilesScreen,
    filesHandlers({
      'files.list': () =>
        folder('/home/Documents', {
          crumbs: [
            { path: '/home', name: null },
            { path: '/home/Documents', name: 'Documents' },
          ],
          items,
          count: items.length,
        }),
      'files.preview': (input) => ({
        url: `/api/files/preview/${(input as { path: string }).path}#${++links}`,
        expiresAt: 1,
      }),
      'files.stat': (input) => ({
        ...items.find((i) => i.path === (input as { path: string }).path),
        dimensions: { width: 4032, height: 3024 },
        parent: [
          { path: '/home', name: null },
          { path: '/home/Documents', name: 'Documents' },
        ],
        readOnly: false,
      }),
      ...over,
    }),
    { path: '/files', entries: ['/files?path=%2Fhome%2FDocuments'] },
  );
  return { ...result, links: () => links };
}

async function openFile(name: RegExp) {
  const item = await screen.findByRole('button', { name });
  item.focus();
  fireEvent.click(item);
  return screen.findByRole('dialog', { name: /^Preview of / });
}

describe('US-FILE-06', () => {
  it('an image shows fitted, with its name, Download and Close preview, and its details', async () => {
    open();
    const dialog = await openFile(/^Kitchen plan\.jpg/);
    expect(within(dialog).getByRole('heading', { name: 'Kitchen plan.jpg' })).toBeInTheDocument();
    expect(await within(dialog).findByRole('img', { name: 'Kitchen plan.jpg' })).toHaveAttribute(
      'src',
      '/api/files/preview//home/Documents/Kitchen plan.jpg#1',
    );
    // US-FILE-05: Download is in the preview's header.
    const download = within(dialog).getByRole('link', { name: 'Download' });
    expect(download).toHaveAttribute('href', '/api/files/download?path=%2Fhome%2FDocuments%2FKitchen%20plan.jpg');
    expect(download).toHaveAttribute('download', 'Kitchen plan.jpg');
    expect(within(dialog).getByRole('button', { name: 'Close preview' })).toBeInTheDocument();
    // Share waits for phase 9; ••• has Rename, Move and Trash (phase 5).
    expect(within(dialog).queryByRole('button', { name: 'Share' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'More' })).toBeInTheDocument();
    const details = within(dialog).getByRole('region', { name: 'Details' });
    expect(details).toHaveTextContent('Size3.4 MB');
    expect(await within(details).findByText('4032 × 3024')).toBeInTheDocument();
    expect(details).toHaveTextContent('Modified12 Sep 2026');
    expect(within(details).getByRole('button', { name: 'Home › Documents' })).toBeInTheDocument();
  });

  it('Previous and Next (and Left and Right) move through the files, skipping folders', async () => {
    open();
    const dialog = await openFile(/^Kitchen plan\.jpg/);
    // The first file: no Previous (Bills is a folder).
    expect(within(dialog).queryByRole('button', { name: 'Previous file' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next file' }));
    expect(within(dialog).getByRole('heading', { name: 'Budget 2026.xlsx' })).toBeInTheDocument();
    fireEvent.keyDown(within(dialog).getByRole('heading', { level: 2 }), { key: 'ArrowRight' });
    expect(within(dialog).getByRole('heading', { name: 'notes.txt' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Next file' })).toBeNull();
    fireEvent.keyDown(within(dialog).getByRole('heading', { level: 2 }), { key: 'ArrowLeft' });
    expect(within(dialog).getByRole('heading', { name: 'Budget 2026.xlsx' })).toBeInTheDocument();
  });

  it('Escape closes the preview and focus goes back to the file', async () => {
    open();
    const dialog = await openFile(/^Kitchen plan\.jpg/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next file' }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: /^Budget 2026\.xlsx/ })).toHaveFocus());
  });

  it('a kind with no preview shows its icon, "No preview for this kind of file" and Download', async () => {
    open();
    const dialog = await openFile(/^Budget 2026\.xlsx/);
    expect(within(dialog).getByText('No preview for this kind of file')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('link', { name: 'Download' })).toHaveLength(2);
  });

  it('text shows in monospace; an expired link (410) is renewed without saying anything', async () => {
    const fetches: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        fetches.push(url);
        return fetches.length === 1
          ? new Response(null, { status: 410 })
          : new Response('hello world', { headers: { 'x-hlabs-truncated': '0' } });
      }),
    );
    const { links } = open();
    const dialog = await openFile(/^notes\.txt/);
    expect(await within(dialog).findByText('hello world')).toBeInTheDocument();
    expect(links()).toBe(2);
    expect(within(dialog).queryByText("Couldn't show this file")).toBeNull();
  });

  it('what each type shows, and dates', () => {
    expect(
      ['image/heic', 'application/zip', 'image/png', 'video/quicktime', 'application/pdf', 'text/x-python'].map((m) =>
        previewKind(m, true),
      ),
    ).toEqual(['none', 'none', 'image', 'video', 'pdf', 'text']);
    expect(previewKind('application/pdf', false)).toBe('none');
    expect(formatDay(new Date(2026, 8, 12).getTime())).toBe('12 Sep 2026');
  });
});
