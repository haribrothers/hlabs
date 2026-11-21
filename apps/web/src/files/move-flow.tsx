// Moving items (US-FILE-22): from the dialog, a drag onto a folder or a sidebar place. Names already there are asked
// about one at a time with the uploads' Skip / Keep both / Replace (and "Do this for every conflict"). A move done at
// once shows "Moved 3 items to Taxes" with Undo; one between disks shows a toast with a bar that follows the job.
import type { FileEntry } from '@hlabs/api';
import type { FileAccent } from '@hlabs/ui/files';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { filesCopy as copy } from '../copy/files';
import { errorCode, errorData, showErrorToast } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useEventStream } from '../lib/use-event-stream';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { ConflictDialog } from './conflict-dialog';
import { MoveDialog, type MoveRoot } from './move-dialog';
import type { ConflictAnswer, OnConflict } from './upload-manager';

/** Running moves, so their toasts keep their words as the job reports. */
const running = new Map<string, { title: string; done: string }>();
const toastKey = (jobId: string) => `files-move:${jobId}`;

/** "Moved 3 items to Taxes", "Moved “Lease.pdf” to Taxes". */
const movedTitle = (names: string[], folder: string) =>
  names.length === 1 ? copy.movedOne(names[0]!, folder) : copy.movedMany(names.length, folder);

export function useMoveFlow({ roots, accent }: { roots: MoveRoot[]; accent: FileAccent }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ entries: FileEntry[]; from: string; onDone?: () => void } | null>(null);
  const [asking, setAsking] = useState<{
    name: string;
    folderName: string;
    answer: (a: ConflictAnswer) => void;
  } | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.files.list.pathKey() });

  // A move between disks: its toast's bar follows the job, then says how it went.
  useEventStream((event) => {
    if (event.type === 'job.progress' && event.data.kind === 'files_move') {
      const r = running.get(event.data.jobId);
      if (r)
        showToast({
          tone: 'neutral',
          key: toastKey(event.data.jobId),
          title: r.title,
          body: copy.movingBody,
          progress: event.data.progress,
        });
    }
    if (event.type === 'job.finished' && event.data.kind === 'files_move') {
      const r = running.get(event.data.jobId);
      running.delete(event.data.jobId);
      void refresh();
      if (!r) return;
      showToast(
        event.data.state === 'succeeded'
          ? { tone: 'success', key: toastKey(event.data.jobId), title: r.done }
          : { tone: 'danger', key: toastKey(event.data.jobId), title: copy.moveFailed, body: copy.moveFailedBody },
      );
    }
  });

  const ask = (name: string, folderName: string) =>
    new Promise<ConflictAnswer>((resolve) =>
      setAsking({
        name,
        folderName,
        answer: (a) => {
          setAsking(null);
          resolve(a);
        },
      }),
    );

  /** Moves `entries` from `from` into `to`, asking about names already there. */
  async function move(
    entries: FileEntry[],
    from: string,
    to: string,
    toName: string,
    conflicts: Record<string, OnConflict> = {},
  ) {
    const names = entries.map((e) => e.name);
    try {
      const res = await client.files.move.mutate({ paths: entries.map((e) => e.path), to, conflicts });
      if ('jobId' in res) {
        running.set(res.jobId, {
          title: names.length === 1 ? copy.movingOne(names[0]!, toName) : copy.movingMany(names.length, toName),
          done: movedTitle(names, toName),
        });
        showToast({
          tone: 'neutral',
          key: toastKey(res.jobId),
          title: running.get(res.jobId)!.title,
          body: copy.movingBody,
          progress: 0,
        });
        return;
      }
      await refresh();
      if (!res.moved.length) return;
      const back = res.moved.map((m) => m.to);
      showToast({
        tone: 'success',
        title: movedTitle(
          names.filter((n) => res.moved.some((m) => m.from.endsWith(`/${n}`))),
          toName,
        ),
        actions: [
          {
            kind: 'retry',
            label: copy.undo,
            run: () =>
              void client.files.move
                .mutate({ paths: back, to: from })
                .then(refresh)
                .catch((err: unknown) => showErrorToast(err)),
          },
        ],
      });
    } catch (err) {
      if (errorCode(err) !== 'FILES_NAME_EXISTS') {
        showErrorToast(err);
        return;
      }
      // Ask about each name already there; "every conflict" answers the rest.
      const taken = ((errorData(err)?.detail as { names?: string[] } | null)?.names ?? []).filter((n) => !conflicts[n]);
      const answers = { ...conflicts };
      let all: OnConflict | null = null;
      for (const name of taken) {
        if (all) {
          answers[name] = all;
          continue;
        }
        const a = await ask(name, toName);
        answers[name] = a.choice;
        if (a.all) all = a.choice;
      }
      if (taken.length) await move(entries, from, to, toName, answers);
    }
  }

  const ui: ReactNode = (
    <>
      {dialog ? (
        <MoveDialog
          entries={dialog.entries}
          from={dialog.from}
          roots={roots}
          accent={accent}
          onClose={() => setDialog(null)}
          onMove={(to, name) => {
            const { entries, from, onDone } = dialog;
            setDialog(null);
            onDone?.();
            void move(entries, from, to, name);
          }}
        />
      ) : null}
      {asking ? <ConflictDialog row={asking} onAnswer={asking.answer} /> : null}
    </>
  );

  return {
    /** "Move to…": the dialog for these items. */
    choose: (entries: FileEntry[], from: string, onDone?: () => void) => setDialog({ entries, from, onDone }),
    /** A drop onto a folder: straight there. */
    move: (entries: FileEntry[], from: string, to: string, toName: string) => void move(entries, from, to, toName),
    ui,
  };
}
