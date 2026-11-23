// US-FILE-21 · Use the right-click menu: a right-click (or Shift+F10) opens the menu in the drawn order and selects
// nothing (D-137); on a ticked item while selecting it's for them all, without Open, Open with, Copy link or Rename…;
// Copy link copies the address with its toast; Duplicate copies next to it and focuses it; a read-only place turns the
// changes off; Esc closes and focus goes back; on a phone each item's "•••" opens the same actions as a sheet.
import type { FileEntry } from '@hlabs/api';
import type * as Shared from '@hlabs/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { renderScreen } from '../test/render';
import { filesHandlers, folder } from '../test/files';
import { FilesScreen } from './files-page';
import { itemMenu } from './item-menu-model';

vi.mock('@hlabs/shared', async (importOriginal) => {
  const shared = await importOriginal<typeof Shared>();
  return { ...shared, isFeatureEnabled: (f: never, p = 5) => shared.isFeatureEnabled(f, p) };
});

const entry = (name: string, kind: 'file' | 'folder' = 'file') =>
  ({
    name,
    path: `/home/Documents/${name}`,
    kind,
    size: kind === 'file' ? 1000 : null,
    childCount: kind === 'folder' ? 1 : null,
    modifiedAt: 1,
    mime: null,
    previewUrl: null,
  }) as FileEntry;

function open(readOnly = false) {
  let names = ['Bills', 'a.pdf', 'b.pdf'];
  return renderScreen(
    FilesScreen,
    filesHandlers({
      'files.list': () =>
        folder('/home/Documents', {
          crumbs: [{ path: '/home/Documents', name: 'Documents' }],
          place: { area: readOnly ? 'app' : 'home', name: 'Hari', readOnly },
          items: names.map((n) => entry(n, n.includes('.') ? 'file' : 'folder')),
          count: names.length,
        }),
      'files.copy': (i) => {
        const to = (i as { paths: string[] }).paths.map((p) => p.replace('.pdf', ' copy.pdf'));
        names = [...names, ...to.map((p) => p.slice(p.lastIndexOf('/') + 1))];
        return { copied: to.map((t) => ({ from: '', to: t })) };
      },
    }),
    { path: '/files', entries: ['/files?path=%2Fhome%2FDocuments'] },
  );
}

const labels = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole('menuitem')
    .map((m) => m.textContent);

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});
afterEach(() => {
  // @ts-expect-error tests put matchMedia in for the phone case
  delete window.matchMedia;
});

describe('US-FILE-21', () => {
  it('offers the drawn groups; several items leave some out; read-only turns changes off', () => {
    const can = { rename: true, move: true, trash: true };
    const names = (g: ReturnType<typeof itemMenu>) => g.map((x) => x.map((m) => m.label));
    expect(names(itemMenu({ entries: [entry('a.pdf')], readOnly: false, canShareFiles: true, can }))).toEqual([
      ['Open', 'Open with'],
      ['Share…', 'Copy link', 'Download'],
      ['Rename…', 'Move to…', 'Duplicate'],
      ['Move to Trash'],
    ]);
    expect(
      names(itemMenu({ entries: [entry('Bills', 'folder')], readOnly: false, canShareFiles: true, can }))[0],
    ).toEqual(['Open']);
    expect(
      names(itemMenu({ entries: [entry('a.pdf'), entry('b.pdf')], readOnly: false, canShareFiles: false, can })),
    ).toEqual([['Download'], ['Move to…', 'Duplicate'], ['Move to Trash']]);
    const ro = itemMenu({ entries: [entry('a.pdf')], readOnly: true, canShareFiles: false, can }).flat();
    expect(ro.filter((m) => m.disabled).map((m) => m.label)).toEqual([
      'Rename…',
      'Move to…',
      'Duplicate',
      'Move to Trash',
    ]);
  });

  it('a right-click opens the menu for that item and selects nothing', async () => {
    open();
    await screen.findByRole('group', { name: 'Documents' });
    fireEvent.contextMenu(screen.getByRole('button', { name: /^a\.pdf/ }), { clientX: 400, clientY: 300 });
    const menu = await screen.findByRole('menu');
    expect(labels(menu)).toEqual([
      'Open↵',
      'Open with›',
      'Copy link',
      'Download',
      'Rename…',
      'Move to…',
      'Duplicate',
      'Move to Trash⌫',
    ]);
    expect(document.querySelectorAll('[aria-selected="true"]')).toHaveLength(0);
  });

  it('on a ticked item while selecting, the menu is for every ticked item', async () => {
    open();
    await screen.findByRole('group', { name: 'Documents' });
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: /^a\.pdf/ }));
    fireEvent.click(screen.getByRole('button', { name: /^b\.pdf/ }));
    fireEvent.contextMenu(screen.getByRole('button', { name: /^b\.pdf/ }), { clientX: 400, clientY: 300 });
    const menu = await screen.findByRole('menu');
    expect(labels(menu)).toEqual(['Download', 'Move to…', 'Duplicate', 'Move to Trash⌫']);
  });

  it('Copy link copies the address and says who can use it', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    open();
    await screen.findByRole('group', { name: 'Documents' });
    fireEvent.contextMenu(screen.getByRole('button', { name: /^a\.pdf/ }), { clientX: 1, clientY: 1 });
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Copy link' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/files?path=%2Fhome%2FDocuments%2Fa.pdf`),
    );
    await waitFor(() =>
      expect(currentToasts().map((t) => t.title)).toContain(
        'Link copied · only people who can open this folder can use it',
      ),
    );
  });

  it('Duplicate makes a copy next to it and focuses the copy', async () => {
    const { calls } = open();
    await screen.findByRole('group', { name: 'Documents' });
    fireEvent.contextMenu(screen.getByRole('button', { name: /^a\.pdf/ }), { clientX: 1, clientY: 1 });
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Duplicate' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.path === 'files.copy').map((c) => c.input)).toEqual([
        { paths: ['/home/Documents/a.pdf'], to: '/home/Documents' },
      ]),
    );
    const copyItem = await screen.findByRole('button', { name: /^a copy\.pdf/ });
    await waitFor(() => expect(copyItem).toHaveFocus());
  });

  it('a read-only place turns Rename…, Move to…, Duplicate and Move to Trash off', async () => {
    open(true);
    await screen.findByRole('group', { name: 'Documents' });
    fireEvent.contextMenu(screen.getByRole('button', { name: /^a\.pdf/ }), { clientX: 1, clientY: 1 });
    const menu = await screen.findByRole('menu');
    for (const name of ['Rename…', 'Move to…', 'Duplicate', 'Move to Trash'])
      expect(within(menu).getByRole('menuitem', { name: new RegExp(`^${name}`) })).toHaveAttribute('data-disabled');
  });

  it('Shift+F10 opens it from the keyboard; Esc closes and focus goes back to the item', async () => {
    open();
    await screen.findByRole('group', { name: 'Documents' });
    const a = screen.getByRole('button', { name: /^a\.pdf/ });
    a.focus();
    fireEvent.keyDown(a, { key: 'F10', shiftKey: true });
    const menu = await screen.findByRole('menu');
    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(a).toHaveFocus());
  });

  it('on a phone each item’s "•••" opens the same actions as a sheet', async () => {
    window.matchMedia = ((query: string) => ({
      matches: !query.includes('min-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    open();
    await screen.findByRole('group', { name: 'Documents' });
    fireEvent.click(screen.getByRole('button', { name: 'More for a.pdf' }));
    const sheet = await screen.findByRole('dialog', { name: 'a.pdf' });
    expect(
      within(sheet)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(
      expect.arrayContaining([
        'Open',
        'Open with',
        'Copy link',
        'Download',
        'Rename…',
        'Move to…',
        'Duplicate',
        'Move to Trash',
      ]),
    );
    fireEvent.click(within(sheet).getByRole('button', { name: 'Rename…' }));
    expect(await screen.findByRole('dialog', { name: 'Rename' })).toBeInTheDocument();
  });
});
