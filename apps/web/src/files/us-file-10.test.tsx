// US-FILE-10 · Handle name conflicts when uploading: a taken name asks Skip / Keep both / Replace when it reaches the
// front of the queue; the choice goes to the server; "Do this for every conflict" answers the rest of the batch.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeTransport, file, manager, settle } from '../test/uploads';
import { ConflictDialog } from './conflict-dialog';
import type { ConflictAnswer, UploadRow } from './upload-manager';

describe('US-FILE-10', () => {
  it('asks about each taken name in turn and sends the choice; Skip says "Skipped"', async () => {
    const t = fakeTransport({ exists: (p) => p !== '/home/new.txt' });
    const asked: string[] = [];
    const answers: ConflictAnswer[] = [
      { choice: 'replace', all: false },
      { choice: 'skip', all: false },
    ];
    const { m } = manager(t, {
      askConflict: async (row) => {
        asked.push(row.name);
        return answers.shift()!;
      },
    });
    m.add([file('a.pdf', 1), file('new.txt', 1), file('b.pdf', 1)], '/home', 'Home');
    await settle();
    expect(asked).toEqual(['a.pdf', 'b.pdf']);
    expect(t.calls.filter((c) => c.startsWith('create'))).toEqual(['create a.pdf replace', 'create new.txt keepBoth']);
    expect(m.getSnapshot().rows.map((r) => r.status)).toEqual(['done', 'done', 'skipped']);
  });

  it('"Do this for every conflict" answers the rest of the batch without asking', async () => {
    const t = fakeTransport({ exists: () => true });
    let asked = 0;
    const { m } = manager(t, {
      askConflict: async () => {
        asked++;
        return { choice: 'keepBoth', all: true };
      },
    });
    m.add([file('a', 1), file('b', 1), file('c', 1)], '/home', 'Home');
    await settle();
    expect(asked).toBe(1);
    expect(t.calls.filter((c) => c.startsWith('create'))).toEqual([
      'create a keepBoth',
      'create b keepBoth',
      'create c keepBoth',
    ]);
  });

  it('the dialog: "“<name>” already exists in <folder>", Skip, Keep both, Replace and the checkbox', () => {
    const answers: ConflictAnswer[] = [];
    const row = { name: 'Report.pdf', folderName: 'Documents' } as UploadRow;
    render(<ConflictDialog row={row} onAnswer={(a) => answers.push(a)} />);
    const dialog = screen.getByRole('dialog', { name: '“Report.pdf” already exists in Documents' });
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Skip', 'Replace', 'Keep both']);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Do this for every conflict' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Replace' }));
    expect(answers).toEqual([{ choice: 'replace', all: true }]);
  });
});
