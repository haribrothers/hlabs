// US-STORE-27 · Start my own app library, US-STORE-28 · Sign my library and US-STORE-29 · Copy a built-in app into my
// library (server side): a folder library under the storage root is added like any source, its broken apps named with
// file and line while the rest sync, "Not signed" unless signed; a signed folder leaves out apps changed since; the
// `hlabs library` keys stay in the keychain; a copy lands in a folder library at once, or as a zip for a git one.
import { verifyIndex } from '@hlabs/app-manifest/node';
import { addLibraryApp } from '@hlabs/app-manifest/library';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MemorySecretStore } from '../src/platform/secrets';
import { LIBRARY_KEY_REF, libraryKeygen, librarySign } from '../src/store/library-keys';
import { filesDaemon } from './files-fixture';
import { makeLibrary, serve } from './library-fixture';
import { storeFixture } from './store-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply<T = Record<string, unknown>> = {
  result?: { data: T };
  error?: { data: { hlabsCode: string; detail?: unknown } };
};
type Source = {
  id: string;
  name: string;
  appCount: number;
  signed: boolean;
  problems: Array<{ file: string; line?: number; message: string }>;
  filesPath: string | null;
  lastError: string | null;
};

async function setup(opts: { sign?: boolean; where?: string } = {}) {
  const remote = makeLibrary();
  const web = serve(remote.dir);
  const f = await filesDaemon(closers, {
    config: {
      resources: { storeDir: storeFixture(), binDir: '/none', webFallbackDir: '/none', webDir: '/none' },
    } as never,
    boot: { sourceFetch: web.fetch as never },
  });
  const dir = join(f.root, opts.where ?? 'users/hari/my-apps');
  mkdirSync(join(dir, '..'), { recursive: true });
  const lib = makeLibrary({ dir, name: 'My apps', sign: opts.sign });
  const sources = async () =>
    ((await f.d.query('store.sources.list')) as Reply<{ sources: Source[] }>).result!.data.sources;
  const add = async (url = dir) => {
    const seen = (await f.d.query('store.sources.inspect', { url })) as Reply<{ keyFingerprint: string | null }>;
    if (seen.error) return seen as unknown as Reply<{ sourceId: string }>;
    return (await f.d.mutate('store.sources.add', { url, keyFingerprint: seen.result!.data.keyFingerprint })) as Reply<{
      sourceId: string;
    }>;
  };
  return { ...f, dir, lib, web, remote, sources, add };
}

describe('US-STORE-27', () => {
  it('a folder under the storage root adds like any source; its apps are in the store, "Not signed", with Open folder', async () => {
    const t = await setup();
    const { sourceId } = (await t.add()).result!.data;
    const source = (await t.sources()).find((s) => s.id === sourceId)!;
    expect(source).toMatchObject({ name: 'My apps', appCount: 1, signed: false, filesPath: '/users/hari/my-apps' });
    const app = (await t.d.query('store.getApp', { appId: 'example-app' })) as Reply<{ source: unknown }>;
    expect(app.result!.data.source).toEqual({
      id: sourceId,
      name: 'My apps',
      official: false,
      signed: false,
      kind: 'local',
    });
  });

  it('a broken app is named with file and line and left out, while the rest still sync', async () => {
    const t = await setup();
    const { sourceId } = (await t.add()).result!.data;
    addLibraryApp(t.dir, 'wiki');
    writeFileSync(
      join(t.dir, 'apps/wiki/hlabs-app.yml'),
      readFileSync(join(t.dir, 'apps/example-app/hlabs-app.yml'), 'utf8').replace(/example-app/g, 'wiki'),
    );
    writeFileSync(
      join(t.dir, 'apps/wiki/docker-compose.yml'),
      'services:\n  web:\n    image: nginx:1.27\n    network_mode: host\n',
    );
    await t.d.mutate('store.sources.sync', { sourceId });
    const source = (await t.sources()).find((s) => s.id === sourceId)!;
    expect(source.appCount).toBe(1);
    expect(source.problems).toEqual([
      expect.objectContaining({
        file: 'apps/wiki/docker-compose.yml',
        line: 4,
        message: expect.stringMatching(/host network/i),
      }),
    ]);
  });

  it("a folder outside the storage root, in Shared or in a member's Home is refused", async () => {
    const t = await setup({ where: 'shared/apps-lib' });
    expect((await t.add()).error?.data.hlabsCode).toBe('SOURCE_PATH_SHARED');
    const memberLib = join(t.root, 'users/anu/lib');
    makeLibrary({ dir: memberLib });
    expect((await t.add(memberLib)).error?.data.hlabsCode).toBe('SOURCE_PATH_SHARED');
    const outside = makeLibrary();
    expect((await t.add(outside.dir)).error?.data.hlabsCode).toBe('SOURCE_PATH_OUTSIDE');
  });

  it('an app from a library installs from that library', async () => {
    const t = await setup();
    await t.add();
    const res = (await t.d.mutate('apps.install', { appId: 'example-app' })) as Reply<{ jobId: string }>;
    expect(res.error?.data.hlabsCode).not.toBe('NOT_FOUND');
  });
});

describe('US-STORE-28', () => {
  it('keygen keeps the private key in the secret store and gives its fingerprint; sign signs with it', async () => {
    const secrets = new MemorySecretStore();
    await expect(librarySign(secrets, Buffer.from('{}').toString('base64'))).rejects.toMatchObject({
      cause: expect.objectContaining({ hlabsCode: 'LIBRARY_KEY_MISSING' }),
    });
    const made = await libraryKeygen(secrets, false);
    expect(made).toMatchObject({
      existed: false,
      fingerprint: expect.stringMatching(/^[0-9A-F]{4}( [0-9A-F]{4}){3}$/),
    });
    expect(JSON.parse((await secrets.get(LIBRARY_KEY_REF))!).secretKey).toMatch(/BEGIN PRIVATE KEY/);
    expect(await libraryKeygen(secrets, false)).toMatchObject({ existed: true, fingerprint: made.fingerprint });
    const data = Buffer.from('{"schema":1}');
    const signed = await librarySign(secrets, data.toString('base64'));
    expect(verifyIndex(data, signed.signature, made.publicKey)).toBe(true);
    expect((await libraryKeygen(secrets, true)).fingerprint).not.toBe(made.fingerprint);
  });

  it('a signed folder shows its fingerprint; an app changed after signing is left out until signed again', async () => {
    const t = await setup({ sign: true });
    const { sourceId } = (await t.add()).result!.data;
    expect((await t.sources()).find((s) => s.id === sourceId)).toMatchObject({ signed: true, appCount: 1 });
    writeFileSync(
      join(t.dir, 'apps/example-app/docker-compose.yml'),
      'services:\n  web:\n    image: traefik/whoami:v1.11\n',
    );
    await t.d.mutate('store.sources.sync', { sourceId });
    const source = (await t.sources()).find((s) => s.id === sourceId)!;
    expect(source.appCount).toBe(0);
    expect(source.problems[0]!.message).toMatch(/Changed since the index was signed/);
  });
});

describe('US-STORE-29', () => {
  it('copies a built-in app into a folder library as a separate app, at once; the same name again is refused', async () => {
    const t = await setup();
    const { sourceId } = (await t.add()).result!.data;
    const res = (await t.d.mutate('store.copyToLibrary', {
      appId: 'uptime-kuma',
      libraryId: sourceId,
      newId: 'uptime-kuma-custom',
    })) as Reply;
    expect(res.result!.data).toMatchObject({ kind: 'folder', appId: 'uptime-kuma-custom' });
    expect((res.result!.data as { path: string }).path).toMatch(/users\/hari\/my-apps\/apps\/uptime-kuma-custom$/);
    expect(readFileSync(join(t.dir, 'apps/uptime-kuma-custom/README.md'), 'utf8')).toMatch(
      /Copied from \*\*uptime-kuma\*\*.* in hlabs official/,
    );
    const copy = (await t.d.query('store.getApp', { appId: 'uptime-kuma-custom' })) as Reply<{
      source: { id: string };
    }>;
    expect(copy.result!.data.source.id).toBe(sourceId);
    const again = (await t.d.mutate('store.copyToLibrary', {
      appId: 'uptime-kuma',
      libraryId: sourceId,
      newId: 'uptime-kuma-custom',
    })) as Reply;
    expect(again.error?.data).toMatchObject({
      hlabsCode: 'LIBRARY_APP_EXISTS',
      detail: { id: 'uptime-kuma-custom', library: 'My apps' },
    });
  });

  it('into a git library, the copy is a zip to download once (admins only)', async () => {
    const t = await setup();
    const added = await t.add(t.web.base);
    expect(added.error).toBeUndefined();
    const { sourceId } = added.result!.data;
    const res = (await t.d.mutate('store.copyToLibrary', {
      appId: 'uptime-kuma',
      libraryId: sourceId,
      newId: 'kuma-mine',
    })) as Reply<{ kind: string; url: string }>;
    expect(res.error).toBeUndefined();
    expect(res.result!.data).toMatchObject({
      kind: 'zip',
      url: expect.stringMatching(/^\/api\/store\/copy\/[\w-]+\.zip$/),
    });
    const url = `${t.d.url}${res.result!.data.url}`;
    expect((await fetch(url, { headers: { cookie: t.anu.cookie } })).status).toBe(404);
    const zip = await fetch(url, { headers: { cookie: t.d.cookie } });
    expect(zip.headers.get('content-disposition')).toBe('attachment; filename="kuma-mine.zip"');
    const bytes = Buffer.from(await zip.arrayBuffer());
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    expect(bytes.includes(Buffer.from('apps/kuma-mine/hlabs-app.yml'))).toBe(true);
    expect(bytes.includes(Buffer.from('id: kuma-mine'))).toBe(true);
    expect((await fetch(url, { headers: { cookie: t.d.cookie } })).status).toBe(404);
  });
});
