// A daemon with a storage root, its admin (Hari, `hari`) and a member (Anu, `anu`), for the Files stories (07-files).
import { storageLocations } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BootDeps } from '../src/boot';
import type { DaemonConfig } from '../src/config';
import { daemonWithAdmin, type Reply } from './admin-session';
import { tempDir } from './helpers';
import { memberSession } from './member-session';
import type { FakeEngine } from './fakes/engine';

export async function filesDaemon(
  closers: Array<() => Promise<void>>,
  opts: { config?: Partial<DaemonConfig>; boot?: Partial<BootDeps>; memberApps?: string[]; engine?: FakeEngine } = {},
) {
  const d = await daemonWithAdmin(closers, opts.config, opts.boot, opts.engine);
  const { db } = d.services!;
  const root = tempDir('hlabs-root-');
  const rootId = ulid();
  db.insert(storageLocations)
    .values({ id: rootId, kind: 'local', name: 'This computer', path: root, isRoot: true })
    .run();
  const anu = await memberSession(d, { appIds: opts.memberApps ?? [] });
  /** Writes a file under the storage root (parents made). */
  const put = (rel: string, content: string | Buffer = 'x') => {
    const path = join(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    return path;
  };
  const data = <T = Record<string, unknown>>(r: Reply) => r.result!.data as T;
  const code = (r: Reply) => r.error?.data.hlabsCode;
  return { d, db, root, rootId, anu, put, data, code, appDataDir: d.services!.config.paths.appDataDir };
}

/** Upload calls as the dashboard makes them (US-FILE-08…10), for a person's cookie and CSRF token. */
export function uploadClient(url: string, who: { cookie: string; csrf: string }) {
  const headers = { cookie: who.cookie, 'x-hlabs-csrf': who.csrf };
  return {
    create: (body: { path: string; name: string; size: number; onConflict?: string }) =>
      fetch(`${url}/api/files/upload`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    chunk: (id: string, offset: number, bytes: string | Buffer) =>
      fetch(`${url}/api/files/upload/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'content-type': 'application/offset+octet-stream', 'upload-offset': String(offset) },
        body: typeof bytes === 'string' ? Buffer.from(bytes) : bytes,
      }),
    head: (id: string) => fetch(`${url}/api/files/upload/${id}`, { method: 'HEAD', headers }),
    cancel: (id: string) => fetch(`${url}/api/files/upload/${id}`, { method: 'DELETE', headers }),
    /** Creates and sends `content` in one chunk; the final reply. */
    async send(path: string, name: string, content: string, onConflict?: string) {
      const made = (await (await this.create({ path, name, size: Buffer.byteLength(content), onConflict })).json()) as {
        id: string;
      };
      return (await (await this.chunk(made.id, 0, content)).json()) as { offset: number; done: unknown };
    },
  };
}
