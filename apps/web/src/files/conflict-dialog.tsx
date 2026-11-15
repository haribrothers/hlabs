// A name that's taken (US-FILE-10): "“<name>” already exists in <folder>" with Skip, Keep both and Replace, and "Do this
// for every conflict" for the rest of the batch.
import { Button, ModalDialog } from '@hlabs/ui';
import { useState } from 'react';
import { filesCopy as copy } from '../copy/files';
import type { ConflictAnswer, OnConflict, UploadRow } from './upload-manager';

export function ConflictDialog({ row, onAnswer }: { row: UploadRow; onAnswer: (answer: ConflictAnswer) => void }) {
  const [all, setAll] = useState(false);
  const answer = (choice: OnConflict) => onAnswer({ choice, all });
  return (
    <ModalDialog
      open
      // Closing it any other way skips this file, the safe answer.
      onOpenChange={(open) => (open ? null : answer('skip'))}
      sheetOnPhone
      title={copy.conflictTitle(row.name, row.folderName)}
      description={copy.conflictBody}
      actions={
        <>
          <Button variant="secondary" onClick={() => answer('skip')}>
            {copy.skip}
          </Button>
          <Button variant="secondary" onClick={() => answer('replace')}>
            {copy.replace}
          </Button>
          <Button onClick={() => answer('keepBoth')}>{copy.keepBoth}</Button>
        </>
      }
    >
      <label className="flex min-h-11 items-center gap-3 text-body text-ink">
        <input
          type="checkbox"
          className="hl-focus size-4 accent-[var(--color-accent)]"
          checked={all}
          onChange={(e) => setAll(e.target.checked)}
        />
        {copy.everyConflict}
      </label>
    </ModalDialog>
  );
}
