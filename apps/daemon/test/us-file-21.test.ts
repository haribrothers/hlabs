// US-FILE-21 · Use the right-click menu (server side): Duplicate is files.copy into the same folder, named
// "<name> copy.<ext>", then "copy 2"; folders copy whole; read-only places refuse.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { filesDaemon } from './files-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Copied = { copied: Array<{ from: string; to: string }> };

describe('US-FILE-21', () => {
  it('Duplicate makes "<name> copy.<ext>", then "copy 2"; a folder copies whole', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/Documents/Lease agreement.pdf', 'lease');
    f.put('users/hari/Documents/Bills/march.pdf', 'm');
    const dup = async (path: string) =>
      f.data<Copied>(await f.d.mutate('files.copy', { paths: [path], to: '/home/Documents' })).copied[0]!.to;
    expect(await dup('/home/Documents/Lease agreement.pdf')).toBe('/home/Documents/Lease agreement copy.pdf');
    expect(await dup('/home/Documents/Lease agreement.pdf')).toBe('/home/Documents/Lease agreement copy 2.pdf');
    expect(await dup('/home/Documents/Bills')).toBe('/home/Documents/Bills copy');
    expect(readFileSync(join(f.root, 'users/hari/Documents/Lease agreement copy.pdf'), 'utf8')).toBe('lease');
    expect(readFileSync(join(f.root, 'users/hari/Documents/Bills copy/march.pdf'), 'utf8')).toBe('m');
  });

  it("read-only places can't take a copy", async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/a.txt');
    expect(f.code(await f.d.mutate('files.copy', { paths: ['/home/a.txt'], to: '/appdata' }))).toBe('FILES_READ_ONLY');
  });
});
