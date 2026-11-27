// US-STORE-27, 28, 29 (the library helpers the `hlabs library` commands and "Copy to my library" use): a new library
// with a README, apps/ and an example app that passes the store's checks; an app to fill in; problems with file and
// line; index.json for the apps that pass; signatures in minisign's format; a copy with a new id and a note.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addLibraryApp,
  checkLibrary,
  copyAppToLibrary,
  indexLibrary,
  initLibrary,
  LIBRARY_WORKFLOW,
  LibraryError,
  problemLine,
} from '../src/library';
import { lineOf } from '../src/node';
import { generateLibraryKey, keyFingerprint, signIndex, verifyIndex } from '../src/signing';

const dir = () => mkdtempSync(join(tmpdir(), 'library-'));
const STORE = join(import.meta.dirname, '../../../store');

describe('US-STORE-27 · Start my own app library', () => {
  it('init makes a README, apps/ with an example app that passes, and the repository workflow', () => {
    const lib = join(dir(), 'my-apps');
    expect(initLibrary(lib)).toEqual([
      'README.md',
      'apps/example-app/hlabs-app.yml',
      'apps/example-app/docker-compose.yml',
      LIBRARY_WORKFLOW,
    ]);
    expect(readFileSync(join(lib, 'README.md'), 'utf8')).toMatch(/App Store › App sources › Add a source/);
    expect(checkLibrary(lib).problems).toEqual([]);
    expect(() => initLibrary(lib)).toThrow(LibraryError);
  });

  it('add makes an app to fill in, whose TODOs are the problems check lists', () => {
    const lib = join(dir(), 'my-apps');
    initLibrary(lib);
    expect(addLibraryApp(lib, 'wiki')).toBe('apps/wiki');
    expect(() => addLibraryApp(lib, 'wiki')).toThrow('apps/wiki is already there');
    expect(() => addLibraryApp(lib, 'Not An Id')).toThrow(LibraryError);
    const wiki = checkLibrary(lib).problems.filter((p) => p.appId === 'wiki');
    expect(wiki.length).toBeGreaterThan(0);
    expect(wiki.every((p) => p.file.startsWith('apps/wiki/'))).toBe(true);
  });

  it('check names the file and line: "apps/wiki/docker-compose.yml:4 Host networking isn\'t allowed."', () => {
    const lib = join(dir(), 'my-apps');
    initLibrary(lib);
    addLibraryApp(lib, 'wiki');
    const app = join(lib, 'apps', 'wiki');
    writeFileSync(
      join(app, 'hlabs-app.yml'),
      readFileSync(join(lib, 'apps/example-app/hlabs-app.yml'), 'utf8').replace(/example-app/g, 'wiki'),
    );
    writeFileSync(
      join(app, 'docker-compose.yml'),
      'services:\n  web:\n    image: nginx:1.27\n    network_mode: host\n',
    );
    const [problem] = checkLibrary(lib).problems;
    expect(problem).toMatchObject({ appId: 'wiki', file: 'apps/wiki/docker-compose.yml', line: 4 });
    expect(problemLine(problem!)).toMatch(/^apps\/wiki\/docker-compose\.yml:4 .*host network/i);
  });

  it('lineOf finds a dotted path, or its nearest parent', () => {
    const text = 'a:\n  b:\n    - x\n    - y\n  c: 1\n';
    expect(lineOf(text, 'a.b.1')).toBe(4);
    expect(lineOf(text, 'a.c')).toBe(5);
    expect(lineOf(text, 'a.missing')).toBe(1);
    expect(lineOf(text, '(file)')).toBeUndefined();
  });

  it('index writes index.json for the apps that pass and names the ones left out', () => {
    const lib = join(dir(), 'my-apps');
    initLibrary(lib);
    addLibraryApp(lib, 'wiki');
    const { index, leftOut } = indexLibrary(lib, { id: 'my-apps', name: 'My apps' });
    expect(index.apps.map((a) => a.id)).toEqual(['example-app']);
    expect(leftOut).toEqual(['wiki']);
    expect(JSON.parse(readFileSync(join(lib, 'index.json'), 'utf8')).source).toEqual({
      id: 'my-apps',
      name: 'My apps',
    });
  });
});

describe('US-STORE-28 · Sign my library', () => {
  it("a key pair with a fingerprint; a signature verifies, and a changed file or another key doesn't", () => {
    const key = generateLibraryKey();
    expect(key.fingerprint).toMatch(/^[0-9A-F]{4}( [0-9A-F]{4}){3}$/);
    expect(keyFingerprint(key.publicKey)).toBe(key.fingerprint);
    expect(key.publicKey).toMatch(/^untrusted comment: minisign public key [0-9A-F]{16}\n/);
    const data = Buffer.from('{"schema":1}');
    const sig = signIndex(data, key);
    expect(verifyIndex(data, sig, key.publicKey)).toBe(true);
    expect(verifyIndex(Buffer.from('{"schema":2}'), sig, key.publicKey)).toBe(false);
    expect(verifyIndex(data, sig, generateLibraryKey().publicKey)).toBe(false);
    expect(verifyIndex(data, 'nonsense', key.publicKey)).toBe(false);
    expect(keyFingerprint('not a key')).toBeNull();
  });
});

describe('US-STORE-29 · Copy a built-in app into my library', () => {
  it('copies the manifest (new id), compose file and logo, with a README saying where it came from', () => {
    const lib = join(dir(), 'my-apps');
    initLibrary(lib);
    const at = copyAppToLibrary({
      fromDir: join(STORE, 'apps', 'uptime-kuma'),
      libraryDir: lib,
      newId: 'uptime-kuma-custom',
      fromSource: 'hlabs official',
      now: new Date('2026-11-22T10:00:00Z'),
    });
    expect(at).toBe('apps/uptime-kuma-custom');
    const target = join(lib, at);
    expect(readFileSync(join(target, 'hlabs-app.yml'), 'utf8')).toMatch(/^id: uptime-kuma-custom$/m);
    expect(readFileSync(join(target, 'logo.svg'), 'utf8')).toBe(
      readFileSync(join(STORE, 'apps/uptime-kuma/logo.svg'), 'utf8'),
    );
    expect(readFileSync(join(target, 'README.md'), 'utf8')).toMatch(
      /Copied from \*\*uptime-kuma\*\* [\d.]+ in hlabs official on 2026-11-22/,
    );
    // A separate app that passes the library's checks.
    expect(checkLibrary(lib).problems).toEqual([]);
    expect(() =>
      copyAppToLibrary({
        fromDir: join(STORE, 'apps', 'uptime-kuma'),
        libraryDir: lib,
        newId: 'uptime-kuma-custom',
        fromSource: 'x',
      }),
    ).toThrow(LibraryError);
  });
});
