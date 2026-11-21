// US-FILE-05 · Download files (server side): GET /api/files/download sends a file with its name (non-ASCII too) and
// honours Range; a folder or several items come as a zip streamed as it's made; nothing outside the person's places.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { attachment } from '../src/http/files';
import { filesDaemon } from './files-fixture';
import { tempDir } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const query = (paths: string[]) => paths.map((p) => `path=${encodeURIComponent(p)}`).join('&');

/** The names in a zip, as `unzip` lists them. */
function zipNames(bytes: ArrayBuffer): string[] {
  const file = join(tempDir(), 'x.zip');
  writeFileSync(file, Buffer.from(bytes));
  return execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' }).trim().split('\n').sort();
}

describe('US-FILE-05', () => {
  it('a file downloads with its own name; Range requests resume part way', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/Videos/Holiday.mp4', '0123456789');
    const get = (path: string, headers: Record<string, string> = {}) =>
      fetch(`${f.d.url}/api/files/download?${query([path])}`, { headers: { cookie: f.d.cookie, ...headers } });
    const whole = await get('/home/Videos/Holiday.mp4');
    expect(whole.status).toBe(200);
    expect(whole.headers.get('content-disposition')).toBe(
      `attachment; filename="Holiday.mp4"; filename*=UTF-8''Holiday.mp4`,
    );
    expect(whole.headers.get('content-type')).toBe('video/mp4');
    expect(whole.headers.get('accept-ranges')).toBe('bytes');
    expect(await whole.text()).toBe('0123456789');
    const part = await get('/home/Videos/Holiday.mp4', { range: 'bytes=4-' });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 4-9/10');
    expect(await part.text()).toBe('456789');
    expect((await get('/home/Videos/Holiday.mp4', { range: 'bytes=20-' })).status).toBe(416);
  });

  it('names that are not plain ASCII use filename*', () => {
    expect(attachment('Résumé (final).pdf')).toBe(
      `attachment; filename="R_sum_ (final).pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9%20%28final%29.pdf`,
    );
    expect(attachment('a"b\\c.txt')).toBe(`attachment; filename="a_b_c.txt"; filename*=UTF-8''a%22b%5Cc.txt`);
  });

  it('a folder downloads as "<folder>.zip", hidden files left out; several items as "hlabs files.zip"', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/Taxes/2025/return.pdf', 'pdf');
    f.put('users/hari/Taxes/notes.txt', 'n');
    f.put('users/hari/Taxes/.secret', 's');
    f.put('users/hari/Taxes/.scan.pdf.hlabs-part', 'p');
    f.put('users/hari/Lease.pdf', 'l');
    const get = (paths: string[]) =>
      fetch(`${f.d.url}/api/files/download?${query(paths)}`, { headers: { cookie: f.d.cookie } });
    const one = await get(['/home/Taxes']);
    expect(one.status).toBe(200);
    expect(one.headers.get('content-type')).toBe('application/zip');
    expect(one.headers.get('content-disposition')).toContain('filename="Taxes.zip"');
    expect(zipNames(await one.arrayBuffer())).toEqual(['Taxes/2025/return.pdf', 'Taxes/notes.txt']);
    const many = await get(['/home/Taxes', '/home/Lease.pdf']);
    expect(many.headers.get('content-disposition')).toContain(`filename="hlabs files.zip"`);
    expect(zipNames(await many.arrayBuffer())).toEqual(['Lease.pdf', 'Taxes/2025/return.pdf', 'Taxes/notes.txt']);
  });

  it("outside a person's places: 403 and no bytes; no session: 401", async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/private.txt', 'secret');
    f.put('shared/family.txt', 'shared');
    const as = (cookie: string, paths: string[]) =>
      fetch(`${f.d.url}/api/files/download?${query(paths)}`, { headers: { cookie } });
    for (const paths of [['/users/hari/private.txt'], ['/shared/family.txt'], ['/home', '/shared/family.txt']]) {
      const r = await as(f.anu.cookie, paths);
      expect([paths, r.status, (await r.text()).length]).toEqual([paths, 403, 0]);
    }
    // Anu's own Home is fine: /home is hers, not Hari's.
    expect((await as(f.anu.cookie, ['/home/private.txt'])).status).toBe(404);
    expect((await as('', ['/home/private.txt'])).status).toBe(401);
    expect((await as(f.d.cookie, ['/home/../anu'])).status).toBe(400);
  });
});
