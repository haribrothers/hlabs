// US-FILE-03 · Create a folder: the New folder dialog (prefilled, selected), Create and Enter, the new folder
// focused, a taken name and a bad name said inline, and read-only places.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { filesHandlers, folder } from '../test/files';
import { daemonError, renderScreen } from '../test/render';
import { FilesScreen } from './files-page';
import { cleanName } from './new-folder-dialog';

function open(over: Record<string, (input: unknown) => unknown> = {}, path = '/home/Documents') {
  let items: unknown[] = [];
  const made: Array<{ path: string; name: string }> = [];
  const result = renderScreen(
    FilesScreen,
    filesHandlers({
      'files.list': (input) =>
        folder((input as { path: string }).path, {
          crumbs: [
            { path: '/home', name: null },
            { path: '/home/Documents', name: 'Documents' },
          ],
          items,
          count: items.length,
        }),
      'files.mkdir': (input) => {
        const i = input as { path: string; name: string };
        made.push(i);
        const p = `${i.path}/${i.name}`;
        items = [
          {
            name: i.name,
            path: p,
            kind: 'folder',
            size: null,
            childCount: 0,
            modifiedAt: 1,
            mime: null,
            previewUrl: null,
          },
        ];
        return { path: p };
      },
      ...over,
    }),
    { path: '/files', entries: [`/files?path=${encodeURIComponent(path)}`] },
  );
  return { ...result, made };
}

describe('US-FILE-03', () => {
  it('New folder opens a dialog with "Untitled folder" selected; Create makes it and focuses it', async () => {
    const { made } = open();
    fireEvent.click(await screen.findByRole('button', { name: 'New folder' }));
    const dialog = await screen.findByRole('dialog', { name: 'New folder' });
    const field = within(dialog).getByRole('textbox', { name: 'Name' }) as HTMLInputElement;
    expect(field.value).toBe('Untitled folder');
    await waitFor(() => expect([field.selectionStart, field.selectionEnd]).toEqual([0, 15]));
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    fireEvent.change(field, { target: { value: ' Taxes ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(made).toEqual([{ path: '/home/Documents', name: 'Taxes' }]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Taxes, folder' })).toHaveFocus());
  });

  it('Enter creates it too', async () => {
    const { made } = open();
    fireEvent.click(await screen.findByRole('button', { name: 'New folder' }));
    const field = await screen.findByRole('textbox', { name: 'Name' });
    fireEvent.submit(field.closest('form')!);
    await waitFor(() => expect(made).toHaveLength(1));
  });

  it('a taken name says so inline and nothing is made', async () => {
    open({
      'files.mkdir': (input) => {
        throw daemonError('FILES_NAME_EXISTS', { name: (input as { name: string }).name });
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'New folder' }));
    const dialog = await screen.findByRole('dialog', { name: 'New folder' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Bills' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('A folder called “Bills” already exists here.');
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled();
    // Another name can be tried.
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Bills 2' } });
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeEnabled();
  });

  it('an empty name, "/" or more than 255 bytes says "Use a shorter name without “/”." and Create is off', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'New folder' }));
    const dialog = await screen.findByRole('dialog', { name: 'New folder' });
    for (const value of ['   ', 'a/b', 'é'.repeat(128)]) {
      fireEvent.change(within(dialog).getByRole('textbox'), { target: { value } });
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Use a shorter name without “/”.');
      expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled();
    }
    expect(cleanName('  Taxes  ')).toBe('Taxes');
    expect(cleanName('x'.repeat(255))).toBe('x'.repeat(255));
    expect(cleanName('é'.repeat(128))).toBeNull();
  });

  it('in a read-only place New folder is unavailable and says why', async () => {
    open(
      {
        'files.list': () =>
          folder('/appdata/immich', {
            crumbs: [
              { path: '/appdata', name: null },
              { path: '/appdata/immich', name: 'Immich' },
            ],
            place: { area: 'app', name: 'Immich', readOnly: true },
          }),
      },
      '/appdata/immich',
    );
    const button = await screen.findByRole('button', { name: 'New folder' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('title', 'This folder is read only');
    expect(button).toHaveAccessibleDescription('This folder is read only');
    fireEvent.click(button);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
