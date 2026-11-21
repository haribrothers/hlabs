// US-FILE-04 · Search files (server side): names containing the query in any case, in the folder and below; at most
// 200 (capped); partial after 5 s (truncated); hidden files never; members only within their places.
import { users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { filesDaemon } from './files-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Found = { items: Array<{ name: string; path: string; kind: string }>; capped: boolean; truncated: boolean };

describe('US-FILE-04', () => {
  it('finds names containing the query, any case, in the folder and every folder below', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/Documents/Bills/Electricity BILL March.pdf');
    f.put('users/hari/Documents/Taxes/2026/bill-of-sale.txt');
    f.put('users/hari/Documents/Taxes/2026/.billing-secret');
    f.put('users/hari/Documents/Lease.pdf');
    f.put('users/hari/Photos/billboard.jpg');
    const found = f.data<Found>(await f.d.query('files.search', { path: '/home/Documents', query: 'bIlL' }));
    expect(found.items.map((i) => i.path).sort()).toEqual([
      '/home/Documents/Bills',
      '/home/Documents/Bills/Electricity BILL March.pdf',
      '/home/Documents/Taxes/2026/bill-of-sale.txt',
    ]);
    expect(found).toMatchObject({ capped: false, truncated: false });
    // From Home, Photos is searched too.
    const all = f.data<Found>(await f.d.query('files.search', { path: '/home', query: 'bill' }));
    expect(all.items.map((i) => i.name)).toContain('billboard.jpg');
    // At least two characters.
    expect(f.code(await f.d.query('files.search', { path: '/home', query: 'b' }))).toBe('VALIDATION_FAILED');
  });

  it('at most 200 results, then capped', async () => {
    const f = await filesDaemon(closers);
    for (let i = 0; i < 230; i++) f.put(`users/hari/Scans/scan ${i}.png`);
    const found = f.data<Found>(await f.d.query('files.search', { path: '/home', query: 'scan ' }));
    expect(found.items).toHaveLength(200);
    expect(found.capped).toBe(true);
  });

  it('stops after 5 seconds and says the results are partial', async () => {
    const f = await filesDaemon(closers);
    for (let i = 0; i < 5; i++) f.put(`users/hari/d${i}/note ${i}.txt`);
    const { files } = f.d.services!;
    const caller = files.caller(f.d.userId, 'admin');
    let t = 0;
    // Each look at the clock is a second later.
    const found = await files.search(caller, { path: '/home', query: 'note' }, () => (t += 1_000));
    expect(found.truncated).toBe(true);
    expect(found.items.length).toBeLessThan(5);
  });

  it("members only find their own files, and Shared's with the permission", async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/report.pdf');
    f.put('users/anu/report draft.docx');
    f.put('shared/report final.pdf');
    const anu = f.data<Found>(await f.anu.query('files.search', { path: '/home', query: 'report' }));
    expect(anu.items.map((i) => i.path)).toEqual(['/home/report draft.docx']);
    expect(f.code(await f.anu.query('files.search', { path: '/shared', query: 'report' }))).toBe('FILES_ACCESS_DENIED');
    expect(f.code(await f.anu.query('files.search', { path: '/users', query: 'report' }))).toBe('FILES_ACCESS_DENIED');
    f.db.update(users).set({ canSeeShared: true }).where(eq(users.username, 'anu')).run();
    const shared = f.data<Found>(await f.anu.query('files.search', { path: '/shared', query: 'report' }));
    expect(shared.items.map((i) => i.path)).toEqual(['/shared/report final.pdf']);
    // An admin searching This computer finds everyone's.
    const admin = f.data<Found>(await f.d.query('files.search', { path: '/users', query: 'report' }));
    expect(admin.items.map((i) => i.path).sort()).toEqual([
      '/shared/report final.pdf',
      '/users/anu/report draft.docx',
      '/users/hari/report.pdf',
    ]);
  });
});
