// US-FILE-19 · Switch to list view and sort (server side): files.list sorts by name, modified or size in either
// direction; each order starts its natural way (A to Z, newest, biggest); folders stay above files.
import { utimesSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { filesDaemon } from './files-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Listing = { items: Array<{ name: string }> };

describe('US-FILE-19', () => {
  it('sorts by name, modified or size, either way, folders always first', async () => {
    const f = await filesDaemon(closers);
    const day = 86_400;
    const now = Math.floor(Date.now() / 1000);
    const put = (name: string, bytes: number, daysAgo: number) => {
      f.put(`users/hari/Documents/${name}`, 'x'.repeat(bytes));
      const at = now - daysAgo * day;
      utimesSync(join(f.root, `users/hari/Documents/${name}`), at, at);
    };
    f.put('users/hari/Documents/Bills/a.txt');
    f.put('users/hari/Documents/Taxes/b.txt');
    f.put('users/hari/Documents/Taxes/c.txt');
    put('apple.txt', 30, 3);
    put('banana.txt', 10, 1);
    put('cherry.txt', 20, 9);
    const names = async (sort?: string, dir?: string) =>
      f.data<Listing>(await f.d.query('files.list', { path: '/home/Documents', sort, dir })).items.map((i) => i.name);

    expect(await names()).toEqual(['Bills', 'Taxes', 'apple.txt', 'banana.txt', 'cherry.txt']);
    expect(await names('name', 'desc')).toEqual(['Taxes', 'Bills', 'cherry.txt', 'banana.txt', 'apple.txt']);
    // Newest first by default; oldest first turned around. Folders stay on top.
    expect((await names('modified')).slice(2)).toEqual(['banana.txt', 'apple.txt', 'cherry.txt']);
    expect((await names('modified', 'asc')).slice(2)).toEqual(['cherry.txt', 'apple.txt', 'banana.txt']);
    // Biggest first by default (folders by their item count); smallest first turned around.
    expect(await names('size')).toEqual(['Taxes', 'Bills', 'apple.txt', 'cherry.txt', 'banana.txt']);
    expect(await names('size', 'asc')).toEqual(['Bills', 'Taxes', 'banana.txt', 'cherry.txt', 'apple.txt']);
  });
});
