import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDb } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { startDaemon, tempDir } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('GET /healthz', () => {
  it('answers 503 "starting" with the boot step, then 200 when ready', async () => {
    const d = await startDaemon({ skipBoot: true });
    closers.push(d.close);

    const before = await fetch(`${d.url}/healthz`);
    expect(before.status).toBe(503);
    expect(await before.json()).toEqual({ reason: 'starting', step: 1, steps: 5, stepLabel: 'Opening the database' });

    await d.boot();
    const after = await fetch(`${d.url}/healthz`);
    expect(after.status).toBe(200);
    expect(await after.json()).toEqual({ status: 'ok', version: '0.0.0-test' });
    expect(after.headers.get('cache-control')).toBe('no-store');
  });

  it('reports migration_failed when the database is newer than this build', async () => {
    const dataDir = tempDir();
    const db = openDb({ dataDir });
    db.$client.prepare('update __drizzle_migrations set created_at = created_at + 1e12').run();
    db.$client.close();

    const d = await startDaemon({ config: { paths: { dataDir, appDataDir: dataDir, storageRootDefault: dataDir } } });
    closers.push(d.close);
    expect(d.services).toBeNull();
    const res = await fetch(`${d.url}/healthz`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ reason: 'migration_failed' });
  });

  it('reports storage_unavailable when the data dir cannot be created', async () => {
    const file = join(tempDir(), 'not-a-dir');
    writeFileSync(file, 'x');
    const dataDir = join(file, 'data');
    const d = await startDaemon({ config: { paths: { dataDir, appDataDir: dataDir, storageRootDefault: dataDir } } });
    closers.push(d.close);
    const res = await fetch(`${d.url}/healthz`);
    expect(await res.json()).toEqual({ reason: 'storage_unavailable' });
  });

  it('only listens on loopback', async () => {
    const d = await startDaemon();
    closers.push(d.close);
    expect(new URL(d.url).hostname).toBe('127.0.0.1');
    expect(d.config.host).toBe('127.0.0.1');
  });
});
