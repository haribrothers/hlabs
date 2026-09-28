// US-HOME-02 · Glance at system widgets (server side): the default widgets and the storage summary.
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-HOME-02', () => {
  it('a new admin gets Live usage, Storage, Remote access and Backups, in that order', async () => {
    const d = await daemonWithAdmin(closers);
    const layout = (await d.query('home.getLayout')).result!.data;
    expect(layout).toEqual({
      items: [
        { kind: 'widget', id: 'live-usage' },
        { kind: 'widget', id: 'storage' },
        { kind: 'widget', id: 'remote-access' },
        { kind: 'widget', id: 'backups' },
      ],
      dock: [],
    });
  });

  it("storage.summary: this computer's disk, free and in use", async () => {
    const d = await daemonWithAdmin(closers);
    expect((await d.query('storage.summary')).result!.data).toEqual({
      totalBytes: 256e9,
      freeBytes: 142e9,
      appsBytes: 0,
      filesBytes: 0,
      systemBytes: 114e9,
      hlabsBytes: 0,
      backupCacheBytes: 0,
      reclaimableImageBytes: 0,
    });
  });
});
