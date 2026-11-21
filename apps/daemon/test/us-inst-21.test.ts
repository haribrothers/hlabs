// US-INST-21 · Choose what to keep when uninstalling: tray.uninstallInfo gives the window its app count, the storage
// root, whether hlabs installed Colima, and the size of what "Delete everything" removes (D-143).
import { apps } from '@hlabs/db';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { folderBytes } from '../src/uninstall/service';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-INST-21', () => {
  it('counts the apps, names the storage root and sizes what Delete everything removes', async () => {
    const t = await installDaemon(closers);
    t.s.db
      .insert(apps)
      .values({
        id: 'immich',
        sourceId: null,
        version: '1.0.0',
        state: 'running',
        hostname: 'immich',
        portFallback: 12000,
        authMode: 'hlabs',
        installedAt: 1,
        updatedAt: 1,
      })
      .run();
    writeFileSync(join(t.root, 'users', 'hari', 'photo.jpg'), Buffer.alloc(3_000_000));
    const info = await t.s.uninstall.info();
    expect(info).toMatchObject({ appCount: 1, storageRoot: t.root, colimaManaged: false });
    expect(info.dataBytes).toBeGreaterThanOrEqual(3_000_000);
  });

  it('counts each file once, follows no links, and gives up after the timeout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'us-inst-21-'));
    mkdirSync(join(dir, 'storage', 'users'), { recursive: true });
    writeFileSync(join(dir, 'hlabs.db'), Buffer.alloc(1000));
    writeFileSync(join(dir, 'storage', 'users', 'a'), Buffer.alloc(500));
    symlinkSync('/usr', join(dir, 'storage', 'link'));
    const linkSize = (await import('node:fs')).lstatSync(join(dir, 'storage', 'link')).size;
    // The storage root inside the data dir is counted once.
    expect(await folderBytes([dir, join(dir, 'storage')], 10_000)).toBe(1500 + linkSize);
    expect(await folderBytes([join(dir, 'storage'), dir], 10_000)).toBe(1500 + linkSize);
    expect(await folderBytes([dir], -1)).toBeNull();
  });
});
