// The one upload manager for this tab (US-FILE-08): it outlives the Files window, so uploads carry on while you move
// between folders. The page that's open answers its questions (name conflicts) and hears when files land.
import { useSyncExternalStore } from 'react';
import { httpTransport, UploadManager, type ConflictAnswer, type UploadRow } from './upload-manager';

interface Handlers {
  exists: (path: string) => Promise<boolean>;
  askConflict: (row: UploadRow) => Promise<ConflictAnswer>;
  onFileDone: (row: UploadRow) => void;
  onAllDone: (uploaded: number) => void;
}

const handlers: Handlers = {
  exists: async () => false,
  askConflict: async () => ({ choice: 'keepBoth', all: false }),
  onFileDone: () => {},
  onAllDone: () => {},
};

export const uploadManager = new UploadManager(
  httpTransport((path) => handlers.exists(path)),
  {
    askConflict: (row) => handlers.askConflict(row),
    onFileDone: (row) => handlers.onFileDone(row),
    onAllDone: (n) => handlers.onAllDone(n),
  },
);

/** Sets who answers (call from the open Files page) and follows the uploads. */
export function useUploads(answer: Partial<Handlers>) {
  Object.assign(handlers, answer);
  return useSyncExternalStore(uploadManager.subscribe, uploadManager.getSnapshot);
}
