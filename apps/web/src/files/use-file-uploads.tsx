// Uploads for the Files page (US-FILE-08…10): the file picker behind Upload, files dropped on the folder, the Uploads
// panel, the name-conflict question, and "<n> uploads were interrupted" after a reload.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@hlabs/ui';
import { useRef, useState, type ReactNode } from 'react';
import { filesCopy as copy } from '../copy/files';
import { errorCode } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { ConflictDialog } from './conflict-dialog';
import { isFinished, type ConflictAnswer, type UploadRow } from './upload-manager';
import { UploadPanel } from './upload-panel';
import { uploadManager, useUploads } from './use-uploads';

/** Files dropped: folders can't be uploaded yet (US-FILE-08), so they're left out and said so. */
export function droppedFiles(data: DataTransfer): { files: File[]; folders: number } {
  const files: File[] = [];
  let folders = 0;
  const items = [...(data.items ?? [])];
  if (items.length) {
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry?.();
      if (entry?.isDirectory) {
        folders++;
        continue;
      }
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  } else {
    files.push(...data.files);
  }
  return { files, folders };
}

export function useFileUploads() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<{ folder: string; folderName: string } | null>(null);
  const resuming = useRef(false);
  const [conflict, setConflict] = useState<{ row: UploadRow; resolve: (a: ConflictAnswer) => void } | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: trpc.files.pathKey() });

  const snapshot = useUploads({
    exists: (path) =>
      client.files.stat.query({ path }).then(
        () => true,
        (err: unknown) => (errorCode(err) === 'NOT_FOUND' ? false : Promise.reject(err)),
      ),
    askConflict: (row) => new Promise((resolve) => setConflict({ row, resolve })),
    onFileDone: refresh,
    onAllDone: (n) => {
      refresh();
      if (n > 0) showToast({ tone: 'success', title: copy.uploadedToast(n) });
    },
  });

  // Uploads this person left unfinished (a reload, a closed tab) that this tab isn't sending.
  const sending = new Set(snapshot.rows.map((r) => r.id).filter(Boolean));
  const left = useQuery({ ...trpc.files.uploads.queryOptions(), staleTime: 30_000 }).data?.uploads ?? [];
  const interrupted = left.filter((u) => !sending.has(u.id));

  const add = (files: File[], folder: string, folderName: string) => {
    if (files.length) uploadManager.add(files, folder, folderName);
  };

  /** Picked files: each one that matches an interrupted upload (name and size) goes back to its folder. */
  const picked = (files: File[]) => {
    const to = target.current;
    const rest: File[] = [];
    for (const file of files) {
      const match = resuming.current
        ? interrupted.find((u) => u.name === file.name && u.size === file.size)
        : undefined;
      if (match) add([file], match.path, match.path.split('/').filter(Boolean).at(-1) ?? copy.home);
      else rest.push(file);
    }
    if (to) add(rest, to.folder, to.folderName);
    resuming.current = false;
  };

  const choose = (folder: string, folderName: string, resume = false) => {
    target.current = { folder, folderName };
    resuming.current = resume;
    input.current?.click();
  };

  const drop = (data: DataTransfer, folder: string, folderName: string) => {
    const { files, folders } = droppedFiles(data);
    if (folders) showToast({ tone: 'warning', title: copy.foldersNotYet, key: 'files:folders' });
    add(files, folder, folderName);
  };

  const ui: ReactNode = (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          picked([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      <UploadPanel
        snapshot={snapshot}
        onPause={() => uploadManager.pause()}
        onResume={() => uploadManager.resume()}
        onCancelAll={() => void uploadManager.cancelAll().then(refresh)}
      />
      {conflict ? (
        <ConflictDialog
          row={conflict.row}
          onAnswer={(a) => {
            setConflict(null);
            conflict.resolve(a);
          }}
        />
      ) : null}
    </>
  );

  /** "<n> uploads were interrupted" with Choose files again, while nothing is being sent. */
  const notice = (folder: string, folderName: string): ReactNode =>
    interrupted.length && snapshot.rows.every(isFinished) ? (
      <div
        role="status"
        className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-control px-4 py-3"
      >
        <div className="min-w-0">
          <p className="m-0 text-label text-ink">{copy.interrupted(interrupted.length)}</p>
          <p className="m-0 text-caption text-ink-muted">{copy.interruptedBody}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => choose(folder, folderName, true)}>
          {copy.chooseAgain}
        </Button>
      </div>
    ) : null;

  return { snapshot, choose, drop, ui, notice };
}
