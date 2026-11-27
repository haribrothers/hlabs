// US-STORE-18 · See and manage app sources, and US-STORE-19 · Add a source with a pinned signing key (server side):
// the built-in source can't be removed; a source's count and last check; Check now; a failed sync keeps the previous
// catalogue and says why; Remove keeps installed apps; "Trust this source?" with the key's fingerprint, pinned on add,
// and a later index signed with another key stops the source; unsigned sources still add; what isn't a source says so.
import { appSources, apps, catalogApps } from '@hlabs/db';
import { generateLibraryKey } from '@hlabs/app-manifest/node';
import { eq } from 'drizzle-orm';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';
import { makeLibrary, serve } from './library-fixture';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply<T = Record<string, unknown>> = { result?: { data: T }; error?: { data: { hlabsCode: string } } };
type Source = {
  id: string;
  name: string;
  url: string;
  appCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
  enabled: boolean;
  signed: boolean;
  keyFingerprint: string | null;
  removable: boolean;
};

async function setup(opts: { sign?: boolean } = {}) {
  const lib = makeLibrary({ sign: opts.sign });
  const web = serve(lib.dir);
  const d = await daemonWithAdmin(closers, {}, { sourceFetch: web.fetch as never });
  const sources = async () =>
    ((await d.query('store.sources.list')) as Reply<{ sources: Source[] }>).result!.data.sources;
  const inspect = async (url = web.base) => (await d.query('store.sources.inspect', { url })) as Reply;
  const add = async (keyFingerprint: string | null, url = web.base) =>
    (await d.mutate('store.sources.add', { url, keyFingerprint })) as Reply<{ sourceId: string }>;
  return { d, lib, web, sources, inspect, add };
}

describe('US-STORE-18', () => {
  it("lists the built-in source first, which can't be removed", async () => {
    const t = await setup();
    const [builtin] = await t.sources();
    expect(builtin).toMatchObject({ id: 'builtin', name: 'hlabs official', removable: false, signed: true });
    expect(builtin!.appCount).toEqual(expect.any(Number));
    expect(((await t.d.mutate('store.sources.remove', { sourceId: 'builtin' })) as Reply).error?.data.hlabsCode).toBe(
      'SOURCE_BUILTIN',
    );
  });

  it('an added source shows its app count and last check, and its apps are in the store', async () => {
    const t = await setup();
    const { sourceId } = (await t.add(null)).result!.data;
    const source = (await t.sources()).find((s) => s.id === sourceId)!;
    expect(source).toMatchObject({
      name: 'Family apps',
      url: 'https://lib.example/family-apps',
      appCount: 1,
      lastError: null,
      removable: true,
    });
    expect(source.lastSyncedAt).toEqual(expect.any(Number));
    const app = (await t.d.query('store.getApp', { appId: 'example-app' })) as Reply<{ source: unknown }>;
    expect(app.result!.data.source).toEqual({
      id: sourceId,
      name: 'Family apps',
      official: false,
      signed: false,
      kind: 'index',
    });
  });

  it('Check now picks up a new app; a failed sync keeps the catalogue and says why', async () => {
    const t = await setup();
    const { sourceId } = (await t.add(null)).result!.data;
    // A second app in the library.
    const dir = join(t.lib.dir, 'apps');
    const src = join(dir, 'example-app');
    const twin = join(dir, 'whoami');
    (await import('node:fs')).cpSync(src, twin, { recursive: true });
    writeFileSync(
      join(twin, 'hlabs-app.yml'),
      readFileSync(join(twin, 'hlabs-app.yml'), 'utf8').replace(/example-app/g, 'whoami'),
    );
    t.lib.reindex();
    let after = ((await t.d.mutate('store.sources.sync', { sourceId })) as Reply<{ sources: Source[] }>).result!.data
      .sources;
    expect(after.find((s) => s.id === sourceId)!.appCount).toBe(2);

    t.web.state.offline = true;
    after = ((await t.d.mutate('store.sources.sync', { sourceId })) as Reply<{ sources: Source[] }>).result!.data
      .sources;
    expect(after.find((s) => s.id === sourceId)).toMatchObject({
      appCount: 2,
      lastError: 'SOURCE_UNREACHABLE',
      enabled: true,
    });
  });

  it('Remove deletes the source and its catalogue; an app installed from it stays, with no source', async () => {
    const t = await setup();
    const { sourceId } = (await t.add(null)).result!.data;
    const db = t.d.services!.db;
    db.insert(apps)
      .values({
        id: 'example-app',
        sourceId,
        version: '1.0.0',
        state: 'running',
        hostname: 'example-app',
        installedAt: 1,
        updatedAt: 1,
      } as never)
      .run();
    expect(((await t.d.mutate('store.sources.remove', { sourceId })) as Reply).result?.data).toEqual({ ok: true });
    expect(db.select().from(appSources).where(eq(appSources.id, sourceId)).get()).toBeUndefined();
    expect(db.select().from(catalogApps).where(eq(catalogApps.sourceId, sourceId)).all()).toEqual([]);
    expect(db.select().from(apps).where(eq(apps.id, 'example-app')).get()).toMatchObject({
      state: 'running',
      sourceId: null,
    });
  });

  it('members never manage sources', async () => {
    const t = await setup();
    const member = await memberSession(t.d);
    expect(((await member.query('store.sources.list')) as Reply).error?.data.hlabsCode).toBe('ACCESS_DENIED');
    expect(
      ((await member.mutate('store.sources.add', { url: t.web.base, keyFingerprint: null })) as Reply).error?.data
        .hlabsCode,
    ).toBe('ACCESS_DENIED');
  });
});

describe('US-STORE-19', () => {
  it('"Trust this source?": name, app count and the signing key\'s fingerprint', async () => {
    const t = await setup({ sign: true });
    const seen = (await t.inspect()).result!.data;
    expect(seen).toEqual({
      kind: 'index',
      url: 'https://lib.example/family-apps',
      name: 'Family apps',
      appCount: 1,
      signed: true,
      keyFingerprint: t.lib.key()!.fingerprint,
    });
    expect(
      t.d
        .services!.db.select()
        .from(appSources)
        .all()
        .map((s) => s.id),
    ).toEqual(['builtin']);
  });

  it('the key is pinned; an index later signed with another key stops the source', async () => {
    const t = await setup({ sign: true });
    const { sourceId } = (await t.add(t.lib.key()!.fingerprint)).result!.data;
    expect((await t.sources()).find((s) => s.id === sourceId)).toMatchObject({
      signed: true,
      keyFingerprint: t.lib.key()!.fingerprint,
    });
    t.lib.sign(generateLibraryKey());
    await t.d.mutate('store.sources.sync', { sourceId });
    expect((await t.sources()).find((s) => s.id === sourceId)).toMatchObject({
      lastError: 'SOURCE_SIGNATURE_MISMATCH',
      enabled: false,
      appCount: 1,
    });
  });

  it('a key that changed between "Trust this source?" and Add isn\'t added', async () => {
    const t = await setup({ sign: true });
    const seen = t.lib.key()!.fingerprint;
    t.lib.sign(generateLibraryKey());
    expect((await t.add(seen)).error?.data.hlabsCode).toBe('SOURCE_SIGNATURE_MISMATCH');
    expect(t.d.services!.db.select().from(appSources).all()).toHaveLength(1);
  });

  it('an unsigned source says so and still adds', async () => {
    const t = await setup();
    expect((await t.inspect()).result!.data).toMatchObject({ signed: false, keyFingerprint: null });
    expect((await t.add(null)).result?.data.sourceId).toBe('family-apps');
  });

  it('nothing there, not https, a duplicate: each says so and nothing is saved', async () => {
    const t = await setup();
    expect((await t.inspect('https://lib.example/nothing-here')).error?.data.hlabsCode).toBe('SOURCE_EMPTY');
    expect((await t.inspect('http://lib.example/family-apps')).error?.data.hlabsCode).toBe('SOURCE_ADDRESS_INVALID');
    await t.add(null);
    expect((await t.add(null)).error?.data.hlabsCode).toBe('SOURCE_EXISTS');
    t.web.state.offline = true;
    expect((await t.inspect('https://lib.example/family-apps/x')).error?.data.hlabsCode).toBe('SOURCE_UNREACHABLE');
  });

  it('a GitHub repository address is read from its files on raw.githubusercontent.com', async () => {
    const lib = makeLibrary();
    const web = serve(lib.dir, 'https://raw.githubusercontent.com/you/family-apps/HEAD/');
    const d = await daemonWithAdmin(closers, {}, { sourceFetch: web.fetch as never });
    const seen = (await d.query('store.sources.inspect', { url: 'https://github.com/you/family-apps' })) as Reply;
    expect(seen.result!.data).toMatchObject({ kind: 'git', url: 'https://github.com/you/family-apps', appCount: 1 });
    expect(web.state.calls[0]).toBe('https://raw.githubusercontent.com/you/family-apps/HEAD/index.json');
  });
});
