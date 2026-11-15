// US-FILE-09 · Pause, resume and cancel uploads (the dashboard's upload manager): Pause stops after the chunk being
// sent and Resume asks the server where it is; a lost connection is tried again after 1, 2, 4, 8 and 16 s, then the
// upload pauses ("Paused · connection lost"); Cancel all removes unfinished uploads on the server; a second tab's
// upload says so.
import { describe, expect, it } from 'vitest';
import { fakeTransport, file, manager, settle } from '../test/uploads';
import { CHUNK_BYTES, UploadHttpError } from './upload-manager';

describe('US-FILE-09', () => {
  it('a lost connection is tried again after 1, 2, 4, 8 and 16 s, then pauses with "connection lost"', async () => {
    const t = fakeTransport();
    const { m, slept } = manager(t);
    t.failNext(6);
    m.add([file('video.mov', 10)], '/home', 'Home');
    await settle();
    expect(slept).toEqual([1_000, 2_000, 4_000, 8_000, 16_000]);
    const snap = m.getSnapshot();
    expect(snap.paused).toBe(true);
    expect(snap.rows[0]!.status).toBe('connectionLost');
    // Resume asks the server where it is and carries on.
    m.resume();
    await settle();
    expect(m.getSnapshot().rows[0]!.status).toBe('done');
    expect(t.calls.filter((c) => c.startsWith('head'))).not.toHaveLength(0);
  });

  it('a chunk that fails twice and then goes through just carries on', async () => {
    const t = fakeTransport();
    const { m, slept } = manager(t);
    t.failNext(2);
    m.add([file('a.bin', 10)], '/home', 'Home');
    await settle();
    expect(slept).toEqual([1_000, 2_000]);
    expect(m.getSnapshot().rows[0]!.status).toBe('done');
  });

  it("Pause lets the chunk being sent finish, sends no more, and Resume continues from the server's offset", async () => {
    const t = fakeTransport();
    const { m } = manager(t);
    const release = t.hold();
    m.add([file('big.mov', CHUNK_BYTES * 3)], '/home', 'Home');
    await settle();
    m.pause();
    release();
    await settle();
    expect(t.calls.filter((c) => c.startsWith('chunk'))).toEqual([`chunk u1 0+${CHUNK_BYTES}`]);
    const row = m.getSnapshot().rows[0]!;
    expect([row.sent, m.getSnapshot().paused]).toEqual([CHUNK_BYTES, true]);
    m.resume();
    await settle();
    expect(t.calls).toContain('head u1');
    expect(t.calls).toContain(`chunk u1 ${CHUNK_BYTES}+${CHUNK_BYTES}`);
    expect(m.getSnapshot().rows[0]!.status).toBe('done');
  });

  it('Cancel all removes unfinished uploads on the server and keeps finished files', async () => {
    const t = fakeTransport();
    const { m } = manager(t);
    m.add([file('small.txt', 5)], '/home', 'Home');
    await settle();
    const release = t.hold();
    m.add([file('big.mov', CHUNK_BYTES * 2)], '/home', 'Home');
    await settle();
    await m.cancelAll();
    release();
    await settle();
    expect(t.calls).toContain('cancel u2');
    expect(t.calls).not.toContain('cancel u1');
    expect(m.getSnapshot().rows).toEqual([]);
  });

  it('an upload being sent from another tab says so', async () => {
    const t = fakeTransport();
    t.chunk = async () => {
      throw new UploadHttpError(409, 'UPLOAD_IN_PROGRESS', null);
    };
    const { m } = manager(t);
    m.add([file('a.bin', 4)], '/home', 'Home');
    await settle();
    expect(m.getSnapshot().rows[0]!.status).toBe('elsewhere');
  });
});

describe('US-FILE-09 · after a reload', () => {
  it('"1 upload was interrupted" with Choose files again; the same file goes back to its folder', async () => {
    const { renderScreen } = await import('../test/render');
    const { filesHandlers, folder } = await import('../test/files');
    const { FilesScreen } = await import('./files-page');
    const { uploadManager } = await import('./use-uploads');
    const { fireEvent, screen } = await import('@testing-library/react');
    const added: Array<[string[], string]> = [];
    const add = uploadManager.add.bind(uploadManager);
    uploadManager.add = (files, to) => void added.push([files.map((f) => f.name), to]);
    try {
      renderScreen(
        FilesScreen,
        filesHandlers({
          'files.list': () => folder('/home'),
          'files.uploads': () => ({
            uploads: [{ id: 'u1', path: '/home/Videos', name: 'Holiday.mov', size: 5, received: 2, updatedAt: 1 }],
          }),
        }),
        { path: '/files' },
      );
      expect(await screen.findByText('1 upload was interrupted')).toBeInTheDocument();
      const picker = document.querySelector<HTMLInputElement>('input[type="file"]')!;
      picker.click = () => {};
      fireEvent.click(screen.getByRole('button', { name: 'Choose files again' }));
      fireEvent.change(picker, { target: { files: [file('Holiday.mov', 5), file('Other.txt', 1)] } });
      expect(added).toEqual([
        [['Holiday.mov'], '/home/Videos'],
        [['Other.txt'], '/home'],
      ]);
    } finally {
      uploadManager.add = add;
    }
  });
});
