// US-INST-22 · Uninstall removes hlabs cleanly, the daemon's part (D-143): the hlabs_uninstall job records it first,
// takes every app down (with its images and volumes when everything goes), removes the hlabs network, unmounts network
// drives, stops the mDNS names and Caddy, and removes hlabs's own Colima when asked; the tray follows it with tray.job.
import { apps, auditLog } from '@hlabs/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newTrayToken, TrayTokens } from '../src/auth/tray-token';
import { silentLogger } from '../src/logger';
import { UninstallService, type UninstallDeps } from '../src/uninstall/service';
import { startDaemon } from './helpers';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function withApps(...ids: string[]) {
  const t = await installDaemon(closers);
  for (const [i, id] of ids.entries()) {
    t.s.db
      .insert(apps)
      .values({
        id,
        sourceId: null,
        version: '1.0.0',
        state: 'running',
        hostname: id,
        portFallback: 12000 + i,
        authMode: 'hlabs',
        installedAt: 1,
        updatedAt: 1,
      })
      .run();
  }
  await t.engine.ensureNetwork('hlabs');
  const messages: Array<string | null> = [];
  t.s.bus.on(({ event }) => {
    if (event.type === 'job.progress' && event.data.kind === 'hlabs_uninstall') messages.push(event.data.message);
  });
  return { ...t, messages };
}

/** The service with some of its outside world replaced, registered in place of the daemon's. */
function service(t: Awaited<ReturnType<typeof withApps>>, over: Partial<UninstallDeps>) {
  const s = t.s;
  const deps: UninstallDeps = {
    db: s.db,
    jobs: s.jobs,
    logger: silentLogger(),
    dataDir: s.config.paths.dataDir,
    storageRootDefault: t.root,
    apps: s.apps,
    engine: () => t.engine,
    colimaManaged: () => false,
    networkDrives: { unmountAll: vi.fn(async () => {}) },
    routing: { stop: vi.fn() },
    mdns: { unpublishAll: vi.fn(async () => {}) },
    proxy: { stop: vi.fn(async () => {}) },
    removeColima: vi.fn(async () => {}),
    ...over,
  };
  const uninstall = new UninstallService(deps);
  uninstall.register();
  return { uninstall, deps };
}

describe('US-INST-22', () => {
  it('records it, takes every app down with its images and volumes, and stops what hlabs runs', async () => {
    const t = await withApps('immich', 'jellyfin');
    const { uninstall, deps } = service(t, {});
    const jobId = uninstall.start({ keepData: false, removeColima: false, via: 'tray' });
    const job = await t.s.jobs.settled(jobId);
    expect(job).toMatchObject({ state: 'succeeded', kind: 'hlabs_uninstall' });

    expect(t.compose.calls.filter((c) => c.op === 'down').map((c) => c.project)).toEqual([
      'hlabs-immich',
      'hlabs-jellyfin',
    ]);
    expect(t.compose.downOptions).toEqual([
      { removeImages: true, removeVolumes: true },
      { removeImages: true, removeVolumes: true },
    ]);
    expect(t.engine.networks.has('hlabs')).toBe(false);
    expect(deps.routing.stop).toHaveBeenCalled();
    expect(deps.networkDrives.unmountAll).toHaveBeenCalled();
    expect(deps.mdns.unpublishAll).toHaveBeenCalled();
    expect(deps.proxy.stop).toHaveBeenCalled();
    expect(deps.removeColima).not.toHaveBeenCalled();
    expect(t.messages).toContain('stoppingApps');
    expect(t.messages).not.toContain('removingColima');

    const audit = t.s.db
      .select()
      .from(auditLog)
      .all()
      .find((r) => r.action === 'system.uninstall');
    expect(audit).toMatchObject({ detailJson: { keepData: false, removeColima: false, via: 'tray' } });
  });

  it('keeping the data keeps images and volumes; hlabs’s Colima goes when asked', async () => {
    const t = await withApps('immich');
    const { uninstall, deps } = service(t, { colimaManaged: () => true });
    await t.s.jobs.settled(uninstall.start({ keepData: true, removeColima: true, via: 'cli' }));
    expect(t.compose.downOptions).toEqual([{ removeImages: false, removeVolumes: false }]);
    expect(deps.removeColima).toHaveBeenCalled();
    expect(t.messages).toContain('removingColima');
  });

  it('an app that can’t be taken down fails the job after the others went down', async () => {
    const t = await withApps('immich', 'jellyfin');
    t.compose.fail('down', 'hlabs-immich');
    const { uninstall, deps } = service(t, {});
    const job = await t.s.jobs.settled(uninstall.start({ keepData: true, removeColima: false, via: 'tray' }));
    expect(job).toMatchObject({ state: 'failed', hlabsCode: 'INTERNAL' });
    expect(t.compose.calls.filter((c) => c.op === 'down').map((c) => c.project)).toContain('hlabs-jellyfin');
    expect(deps.proxy.stop).not.toHaveBeenCalled();
  });

  it('tray.uninstall starts it and tray.job follows it, for the tray token only', async () => {
    const TOKEN = newTrayToken();
    const d = await startDaemon({
      config: { devAnonymousAdmin: false },
      trayTokens: new TrayTokens({ read: async () => TOKEN }),
    });
    closers.push(d.close);
    const call = async (path: string, init?: RequestInit) =>
      (await fetch(`${d.url}/trpc/${path}`, {
        ...init,
        headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      }).then((r) => r.json())) as {
        result?: { data: Record<string, unknown> };
        error?: { data: { hlabsCode: string } };
      };
    const jobQuery = (jobId: string) => `tray.job?input=${encodeURIComponent(JSON.stringify({ jobId }))}`;

    const started = await call('tray.uninstall', {
      method: 'POST',
      body: JSON.stringify({ keepData: true, removeColima: false }),
    });
    const jobId = started.result!.data.jobId as string;
    await d.services!.jobs.settled(jobId);
    expect((await call(jobQuery(jobId))).result!.data).toMatchObject({
      id: jobId,
      kind: 'hlabs_uninstall',
      state: 'succeeded',
    });
    expect(
      d
        .services!.db.select()
        .from(auditLog)
        .all()
        .find((r) => r.action === 'system.uninstall')?.detailJson,
    ).toEqual({ keepData: true, removeColima: false, via: 'tray' });

    // Only the uninstall job, and only for the tray.
    const other = d.services!.jobs.start('noop');
    expect((await call(jobQuery(other))).error!.data.hlabsCode).toBe('NOT_FOUND');
    expect((await fetch(`${d.url}/trpc/${jobQuery(jobId)}`)).status).toBe(401);
  });
});
