// US-FILE-03 · Create a folder (server side): files.mkdir makes it, trims the name, refuses a taken name, a bad name
// and read-only places, and members' access still applies.
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { filesDaemon } from './files-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-FILE-03', () => {
  it('makes the folder (name trimmed) and returns its path', async () => {
    const f = await filesDaemon(closers);
    const made = await f.d.mutate('files.mkdir', { path: '/home/Documents', name: '  Taxes 2026  ' });
    expect(f.data(made)).toEqual({ path: '/home/Documents/Taxes 2026' });
    expect(statSync(join(f.root, 'users/hari/Documents/Taxes 2026')).isDirectory()).toBe(true);
  });

  it('a name already in the folder is FILES_NAME_EXISTS and nothing changes', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/Documents/Bills/a.pdf');
    f.put('users/hari/Documents/notes.txt');
    for (const name of ['Bills', 'notes.txt']) {
      const r = await f.d.mutate('files.mkdir', { path: '/home/Documents', name });
      expect(r.error?.data).toMatchObject({ hlabsCode: 'FILES_NAME_EXISTS', detail: { name } });
    }
    expect(existsSync(join(f.root, 'users/hari/Documents/Bills/a.pdf'))).toBe(true);
  });

  it('empty, "/", "." or more than 255 bytes is FILES_INVALID_NAME', async () => {
    const f = await filesDaemon(closers);
    for (const name of ['', '   ', 'a/b', '.', '..', 'é'.repeat(128), 'x'.repeat(256)]) {
      expect([name.length, f.code(await f.d.mutate('files.mkdir', { path: '/home', name }))]).toEqual([
        name.length,
        'FILES_INVALID_NAME',
      ]);
    }
    expect(f.data(await f.d.mutate('files.mkdir', { path: '/home', name: 'x'.repeat(255) }))).toEqual({
      path: `/home/${'x'.repeat(255)}`,
    });
  });

  it("read-only places and places a member can't use are refused", async () => {
    const f = await filesDaemon(closers);
    expect(f.code(await f.d.mutate('files.mkdir', { path: '/users', name: 'x' }))).toBe('FILES_READ_ONLY');
    expect(f.code(await f.d.mutate('files.mkdir', { path: '/appdata', name: 'x' }))).toBe('FILES_READ_ONLY');
    expect(f.code(await f.anu.mutate('files.mkdir', { path: '/shared', name: 'x' }))).toBe('FILES_ACCESS_DENIED');
    expect(f.code(await f.anu.mutate('files.mkdir', { path: '/home/Nope', name: 'x' }))).toBe('NOT_FOUND');
    expect(f.data(await f.anu.mutate('files.mkdir', { path: '/home', name: 'Mine' }))).toEqual({ path: '/home/Mine' });
    expect(existsSync(join(f.root, 'users/anu/Mine'))).toBe(true);
  });
});
