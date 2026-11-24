// US-SITE-11 · Keep screenshots in the docs current (D-177): the docs instance's demo data set (/dev/demo) has only
// made-up people and the design canvas's store apps, stays in its own data dir, and its pretend computer and clock give
// the same figures every run.
import { apps, backupRuns, storageLocations, users } from '@hlabs/db';
import { existsSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { DEMO_APPS, DEMO_MACHINE, DEMO_PEOPLE, DemoCounters, hostValuesAt } from '../src/demo/figures';
import { DemoEngine, DemoHostStats, DemoSystemProbe } from '../src/demo/fakes';
import { startClockAt } from '../src/platform/dev-clock';
import { startDaemon } from './helpers';

const STORE = resolve(import.meta.dirname, '../../../store');
const MINUTE = 60_000;

let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});

async function demoDaemon(devDemo = true) {
  const d = await startDaemon({
    config: {
      devDemo,
      resources: { storeDir: STORE, binDir: '/nonexistent', webFallbackDir: '/nonexistent', webDir: '/nonexistent' },
    },
  });
  close = d.close;
  return d;
}

describe('US-SITE-11', () => {
  describe('the demo data set', () => {
    it("seeds the design canvas's people and apps, made up, never this computer's user", async () => {
      const d = await demoDaemon();
      const res = await fetch(`${d.url}/dev/demo`, { method: 'POST' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { people: string[]; apps: string[]; files: number };
      expect(body.people).toEqual(['hari', 'maya', 'leo']);

      const { db } = d.services!;
      const people = db.select().from(users).all();
      expect(people.map((p) => [p.username, p.displayName, p.role]).sort()).toEqual([
        ['hari', 'Hari', 'admin'],
        ['leo', 'Leo', 'member'],
        ['maya', 'Maya', 'member'],
      ]);
      const me = userInfo().username.toLowerCase();
      if (me !== 'hari') expect(people.map((p) => p.username)).not.toContain(me);

      // The store's own apps, with their listings' names and logos; two a version behind (App Store updates).
      const installed = db.select().from(apps).all();
      expect(installed.map((a) => a.id).sort()).toEqual(DEMO_APPS.map((a) => a.id).sort());
      expect(installed.every((a) => a.sourceId === 'builtin' && a.state === 'running')).toBe(true);
      expect(installed.filter((a) => DEMO_APPS.find((x) => x.id === a.id)?.update === a.version)).toHaveLength(2);

      // Everything on disk is inside the instance's own data dir.
      const dataDir = d.config.paths.dataDir;
      for (const loc of db.select().from(storageLocations).all()) expect(loc.path.startsWith(dataDir)).toBe(true);
      expect(existsSync(join(dataDir, 'storage', 'users', 'hari', 'Photos', 'Garden in spring.jpg'))).toBe(true);
      expect(body.files).toBeGreaterThan(10);

      // Last night's backup succeeded; one in the month failed.
      const runs = db.select().from(backupRuns).all();
      expect(runs).toHaveLength(30);
      expect(runs.filter((r) => r.status === 'failed')).toHaveLength(1);
    });

    it('is refused once set up, and without HLABS_DEV_DEMO', async () => {
      const d = await demoDaemon();
      expect((await fetch(`${d.url}/dev/demo`, { method: 'POST' })).status).toBe(200);
      expect((await fetch(`${d.url}/dev/demo`, { method: 'POST' })).status).toBe(409);
      await d.close();
      close = null;
      const plain = await demoDaemon(false);
      expect((await fetch(`${plain.url}/dev/demo`, { method: 'POST' })).status).toBe(409);
    });

    it('lists only made-up people and store apps', () => {
      expect(DEMO_PEOPLE.map((p) => p.displayName)).toEqual(['Hari', 'Maya', 'Leo']);
      expect(DEMO_APPS.map((a) => a.id)).toEqual([
        'jellyfin',
        'immich',
        'vaultwarden',
        'nextcloud',
        'home-assistant',
        'paperless-ngx',
      ]);
      for (const app of DEMO_APPS) expect(existsSync(join(STORE, 'apps', app.id, 'hlabs-app.yml'))).toBe(true);
    });
  });

  describe('the pretend computer', () => {
    it('gives the same figures for the same time', async () => {
      const ts = Date.UTC(2026, 9, 14, 9, 41);
      expect(hostValuesAt(ts)).toEqual(hostValuesAt(ts));
      expect(hostValuesAt(ts).cpu).toBeGreaterThan(0);
      expect(hostValuesAt(ts).memBytes).toBeLessThan(DEMO_MACHINE.memoryBytes);
      const probe = new DemoSystemProbe('/data');
      expect(probe.cpu()).toEqual({ model: 'Apple M4', arch: 'arm64' });
      expect(await probe.diskSpace()).toEqual({ totalBytes: 1e12, freeBytes: 612e9 });
      expect(await probe.portInUse()).toBe(false);
      expect(await new DemoHostStats().cpuPercent()).toBeGreaterThan(0);
    });

    it('runs each demo app as one healthy container, and nothing else', async () => {
      const engine = new DemoEngine('hlabs-docs');
      const [c] = await engine.projectContainers('hlabs-docs-jellyfin');
      expect(c).toMatchObject({ service: 'server', state: 'running', health: 'healthy' });
      expect(await engine.projectContainers('hlabs-docs-plex')).toEqual([]);
      expect(await engine.imageSize(c!.imageId)).toBe(DEMO_APPS[0]!.imageBytes);
      expect((await engine.containerStats(c!.id)).cpuPercent).toBeGreaterThan(0);
    });

    it('counts network and disk so two readings give the rate', () => {
      const counters = new DemoCounters();
      const rates = { cpu: 0, memBytes: 0, netRx: 1000, netTx: 500, diskRead: 0, diskWrite: 200 };
      const a = counters.read('host', 0, rates);
      const b = counters.read('host', 5_000, rates);
      expect(b.netRx - a.netRx).toBe(5_000);
      expect(b.diskWrite - a.diskWrite).toBe(1_000);
    });
  });

  describe('the fixed clock (HLABS_DEV_CLOCK)', () => {
    it('starts Date at the given time and runs on from there', () => {
      const real = globalThis.Date;
      try {
        const start = Date.UTC(2026, 9, 14, 9, 41);
        startClockAt(start);
        expect(Math.abs(Date.now() - start)).toBeLessThan(MINUTE);
        expect(Math.abs(new Date().getTime() - start)).toBeLessThan(MINUTE);
        expect(new Date(0).getTime()).toBe(0);
        expect(new Date() instanceof real).toBe(true);
      } finally {
        globalThis.Date = real;
      }
    });

    it('is refused in production, like every development switch', () => {
      expect(() => loadConfig({ NODE_ENV: 'production', HLABS_DEV_DEMO: '1' })).toThrow(/development only/);
      expect(() => loadConfig({ NODE_ENV: 'production', HLABS_DEV_CLOCK: '2026-10-14T09:41:00Z' })).toThrow(
        /development only/,
      );
      expect(loadConfig({ NODE_ENV: 'development', HLABS_DEV_CLOCK: '2026-10-14T09:41:00Z' }).devClock).toBe(
        Date.UTC(2026, 9, 14, 9, 41),
      );
    });
  });
});
