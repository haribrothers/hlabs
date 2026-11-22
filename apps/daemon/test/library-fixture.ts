// Libraries for the app source stories (US-STORE-18, 19, 27…29): one made with the `hlabs library` helpers, served
// over "https" from disk by a fake fetch, optionally signed.
import { generateLibraryKey, signIndex, type LibraryKey } from '@hlabs/app-manifest/node';
import { indexLibrary, initLibrary, PUBLIC_KEY_FILE, SIGNATURE_FILE } from '@hlabs/app-manifest/library';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers';

/** A library folder with the example app, indexed; `sign` signs it with a new (or the given) key. */
export function makeLibrary(opts: { dir?: string; name?: string; sign?: boolean | LibraryKey } = {}) {
  const dir = opts.dir ?? join(tempDir('lib-'), 'family-apps');
  initLibrary(dir, opts.name ?? 'Family apps');
  const reindex = () => indexLibrary(dir, { id: 'family-apps', name: opts.name ?? 'Family apps' });
  reindex();
  let key: LibraryKey | null = null;
  const sign = (k: LibraryKey = key ?? generateLibraryKey()) => {
    key = k;
    writeFileSync(join(dir, SIGNATURE_FILE), signIndex(readFileSync(join(dir, 'index.json')), k));
    writeFileSync(join(dir, PUBLIC_KEY_FILE), k.publicKey);
    return k;
  };
  if (opts.sign) sign(opts.sign === true ? undefined : opts.sign);
  return { dir, sign, reindex, key: () => key };
}

/** A fetch that serves `dir` at `base` (https), counts calls, and can be made to fail. */
export function serve(dir: string, base = 'https://lib.example/family-apps/') {
  const state = { offline: false, calls: [] as string[] };
  const fetch = async (url: string): Promise<Response> => {
    state.calls.push(url);
    if (state.offline) throw new TypeError('fetch failed');
    if (!url.startsWith(base)) return new Response('', { status: 404 });
    const file = join(dir, url.slice(base.length));
    if (!existsSync(file)) return new Response('', { status: 404 });
    const res = new Response(readFileSync(file), { status: 200 });
    Object.defineProperty(res, 'url', { value: url });
    return res;
  };
  return { fetch, state, base };
}
