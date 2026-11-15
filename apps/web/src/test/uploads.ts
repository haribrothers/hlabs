// An upload daemon in memory and helpers, for the upload manager's tests (US-FILE-08…10).
import { UploadHttpError, UploadManager, type UploadTransport } from '../files/upload-manager';

/** A daemon in memory: sessions with offsets; `fail` makes the next n chunks fail with no connection. */
export function fakeTransport(opts: { exists?: (path: string) => boolean } = {}) {
  const sessions = new Map<string, { size: number; offset: number; name: string; onConflict: string }>();
  const calls: string[] = [];
  let next = 1;
  let fail = 0;
  let gate: Promise<void> | null = null;
  const t: UploadTransport & {
    calls: string[];
    sessions: typeof sessions;
    failNext: (n: number) => void;
    hold: () => () => void;
  } = {
    calls,
    sessions,
    failNext: (n) => (fail = n),
    /** Holds chunks until released. */
    hold: () => {
      let release!: () => void;
      gate = new Promise((r) => (release = r));
      return () => {
        gate = null;
        release();
      };
    },
    exists: async (path) => opts.exists?.(path) ?? false,
    create: async ({ name, size, onConflict }) => {
      const id = `u${next++}`;
      calls.push(`create ${name} ${onConflict}`);
      sessions.set(id, { size, offset: 0, name, onConflict });
      return { id, offset: 0 };
    },
    chunk: async (id, offset, bytes) => {
      if (gate) await gate;
      calls.push(`chunk ${id} ${offset}+${bytes.size}`);
      if (fail > 0) {
        fail--;
        throw new TypeError('Failed to fetch');
      }
      const s = sessions.get(id)!;
      if (offset !== s.offset) throw new UploadHttpError(409, 'UPLOAD_OFFSET_MISMATCH', { offset: s.offset });
      s.offset += bytes.size;
      return { offset: s.offset, done: s.offset >= s.size ? { name: s.name, path: `/home/${s.name}` } : null };
    },
    offset: async (id) => {
      calls.push(`head ${id}`);
      return sessions.get(id)?.offset ?? 0;
    },
    cancel: async (id) => {
      calls.push(`cancel ${id}`);
      sessions.delete(id);
    },
  };
  return t;
}

export const file = (name: string, size: number) => new File([new Uint8Array(size)], name);

export function manager(t: UploadTransport, over: Partial<ConstructorParameters<typeof UploadManager>[1]> = {}) {
  const slept: number[] = [];
  const m = new UploadManager(t, {
    askConflict: async () => ({ choice: 'keepBoth', all: false }),
    sleep: async (ms) => {
      slept.push(ms);
    },
    setTimer: () => 0,
    clearTimer: () => {},
    ...over,
  });
  return { m, slept };
}

/** Waits until the manager has nothing left to do. */
export async function settle() {
  for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, 0));
}
