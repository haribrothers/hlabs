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

export async function filesDaemon(
  closers: Array<() => Promise<void>>,
  opts: { config?: Partial<DaemonConfig>; boot?: Partial<BootDeps>; memberApps?: string[] } = {},
) {
  const d = await daemonWithAdmin(closers, opts.config, opts.boot);
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
