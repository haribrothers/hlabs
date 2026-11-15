// US-FILE-08 · Upload files with progress: one file at a time in order; the panel says "Uploading <n> files", the time
// left, and "Done", "62% · 1.1 of 1.8 GB" or "Waiting" per file; no space says "Not enough space"; when all finish it
// waits 5 s and becomes "<n> files uploaded"; dropped folders are left out; Upload opens the picker.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeTransport, file, manager, settle } from '../test/uploads';
import { filesHandlers, folder } from '../test/files';
import { renderScreen } from '../test/render';
import { FilesScreen } from './files-page';
import { UploadHttpError, type UploadSnapshot } from './upload-manager';
import { rowProgress, UploadPanel } from './upload-panel';
import { droppedFiles } from './use-file-uploads';
import { filesCopy } from '../copy/files';

const row = (name: string, status: string, sent: number, size: number) => ({
  key: name.length,
  file: file(name, 0),
  folder: '/home/Documents',
  folderName: 'Documents',
  name,
  size,
  sent,
  status,
  id: 'u',
  savedAs: null,
});

describe('US-FILE-08', () => {
  it('uploads one file at a time, in the order chosen', async () => {
    const t = fakeTransport();
    const { m } = manager(t);
    m.add([file('a.pdf', 3), file('b.mov', 5), file('c.zip', 2)], '/home/Documents', 'Documents');
    await settle();
    expect(t.calls).toEqual([
      'create a.pdf keepBoth',
      'chunk u1 0+3',
      'create b.mov keepBoth',
      'chunk u2 0+5',
      'create c.zip keepBoth',
      'chunk u3 0+2',
    ]);
    expect(m.getSnapshot().rows.map((r) => r.status)).toEqual(['done', 'done', 'done']);
  });

  it('the panel: "Uploading 3 files", the time left, and each file as Done, progress or Waiting', () => {
    const snapshot = {
      rows: [
        row('Tax return 2025.pdf', 'done', 2_000_000, 2_000_000),
        row('Home video.mov', 'uploading', 1_120_000_000, 1_800_000_000),
        row('Receipts.zip', 'waiting', 0, 40_000_000),
      ],
      paused: false,
      secondsLeft: 70,
    } as unknown as UploadSnapshot;
    render(<UploadPanel snapshot={snapshot} onPause={() => {}} onResume={() => {}} onCancelAll={() => {}} />);
    const panel = screen.getByRole('region', { name: 'Uploads' });
    expect(within(panel).getByRole('heading')).toHaveTextContent('Uploading 3 files');
    expect(panel).toHaveTextContent('About 1 min left');
    expect(
      within(panel)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Tax return 2025.pdfDone', 'Home video.mov62% · 1.1 of 1.8 GB', 'Receipts.zipWaiting']);
    expect(within(panel).getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Cancel all' })).toBeInTheDocument();
    expect(rowProgress(500, 900)).toBe('55% · 500 of 900 B');
    expect(filesCopy.eta(20)).toBe('Less than a minute left');
  });

  it('not enough space: that file says so, no data is sent, and the next one goes', async () => {
    const t = fakeTransport();
    const create = t.create;
    t.create = async (body) => {
      if (body.name === 'huge.mov') throw new UploadHttpError(507, 'FILES_NO_SPACE', null);
      return create(body);
    };
    const { m } = manager(t);
    m.add([file('huge.mov', 9), file('small.txt', 1)], '/home', 'Home');
    await settle();
    expect(m.getSnapshot().rows.map((r) => r.status)).toEqual(['noSpace', 'done']);
    expect(t.calls.filter((c) => c.startsWith('chunk'))).toEqual(['chunk u1 0+1']);
  });

  it('when all finish, after 5 s the panel goes and "<n> files uploaded" is said', async () => {
    const t = fakeTransport();
    let timer: { fn: () => void; ms: number } | null = null;
    let done = -1;
    const { m } = manager(t, { setTimer: (fn, ms) => (timer = { fn, ms }), onAllDone: (n) => (done = n) });
    m.add([file('a', 1), file('b', 1)], '/home', 'Home');
    await settle();
    expect(timer!.ms).toBe(5_000);
    expect(m.getSnapshot().rows).toHaveLength(2);
    timer!.fn();
    expect(m.getSnapshot().rows).toEqual([]);
    expect(done).toBe(2);
  });

  it('dropped folders are left out (and counted); files still go', () => {
    const entry = (isDirectory: boolean) => ({ isDirectory });
    const item = (name: string, isDirectory: boolean) => ({
      kind: 'file',
      webkitGetAsEntry: () => entry(isDirectory),
      getAsFile: () => file(name, 1),
    });
    const data = { items: [item('Photos', true), item('a.jpg', false)], files: [] } as unknown as DataTransfer;
    const { files, folders } = droppedFiles(data);
    expect(files.map((f) => f.name)).toEqual(['a.jpg']);
    expect(folders).toBe(1);
  });

  it('Upload is in the toolbar of a folder that can take files, and opens the picker', async () => {
    renderScreen(
      FilesScreen,
      filesHandlers({ 'files.list': () => folder('/home'), 'files.uploads': () => ({ uploads: [] }) }),
      { path: '/files' },
    );
    const upload = await screen.findByRole('button', { name: 'Upload' });
    const picker = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(picker.multiple).toBe(true);
    let opened = false;
    picker.click = () => {
      opened = true;
    };
    fireEvent.click(upload);
    expect(opened).toBe(true);
  });
});

describe('US-FILE-08 · dropping files', () => {
  it('dragging files over the folder says "Drop to upload to <folder>"; dropping uploads them there', async () => {
    const { uploadManager } = await import('./use-uploads');
    const added: Array<[string[], string, string]> = [];
    const add = uploadManager.add.bind(uploadManager);
    uploadManager.add = (files, to, name) => void added.push([files.map((f) => f.name), to, name]);
    try {
      renderScreen(
        FilesScreen,
        filesHandlers({
          'files.list': () =>
            folder('/home/Documents', {
              crumbs: [
                { path: '/home', name: null },
                { path: '/home/Documents', name: 'Documents' },
              ],
            }),
        }),
        { path: '/files', entries: ['/files?path=%2Fhome%2FDocuments'] },
      );
      const empty = await screen.findByText('This folder is empty');
      const zone = empty.closest('[class*="relative"]')!;
      const dataTransfer = { types: ['Files'], items: [], files: [file('Lease.pdf', 3)], dropEffect: '' };
      fireEvent.dragEnter(zone, { dataTransfer });
      expect(screen.getByText('Drop to upload to Documents')).toBeInTheDocument();
      fireEvent.drop(zone, { dataTransfer });
      expect(screen.queryByText('Drop to upload to Documents')).toBeNull();
      expect(added).toEqual([[['Lease.pdf'], '/home/Documents', 'Documents']]);
    } finally {
      uploadManager.add = add;
    }
  });
});
