// US-SYS-04 · See each app's tailnet address (server side): apps.list gives `https://<node>.<tailnet>:<port>` while
// connected, and Serve follows installs and uninstalls.
import { apps } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import type { FakeTailscale } from '../src/tailscale/fake';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const add = (d: Awaited<ReturnType<typeof daemonWithAdmin>>, id: string, port: number) =>
  d
    .services!.db.insert(apps)
    .values({ id, version: '1', state: 'running', hostname: id, portFallback: port, installedAt: port, updatedAt: 1 })
    .run();

describe('US-SYS-04', () => {
  it('no tailnet addresses until connected; then each app on its own port of the computer’s name', async () => {
    const d = await daemonWithAdmin(closers);
    add(d, 'immich', 12001);
    const tailnetUrls = async () =>
      ((await d.query('apps.list')).result!.data.apps as Array<{ urls: { tailnet: string | null } }>).map(
        (a) => a.urls.tailnet,
      );
    expect(await tailnetUrls()).toEqual([null]);
    const ts = d.services!.tailscale as FakeTailscale;
    ts.current = {
      kind: 'running',
      tailnet: 'tail9.ts.net',
      nodeName: 'hari-home',
      httpsEnabled: true,
      keyExpiry: null,
    };
    await d.mutate('network.remote.connect', { confirmTailnet: true });
    expect(await tailnetUrls()).toEqual(['https://hari-home.tail9.ts.net:12001']);
  });

  it('an app installed or uninstalled while connected gets or loses its Serve entry', async () => {
    const d = await daemonWithAdmin(closers);
    const { remote, bus, db } = d.services!;
    add(d, 'immich', 12001);
    const ts = d.services!.tailscale as FakeTailscale;
    ts.current = {
      kind: 'running',
      tailnet: 'tail9.ts.net',
      nodeName: 'hari-home',
      httpsEnabled: true,
      keyExpiry: null,
    };
    await d.mutate('network.remote.connect', { confirmTailnet: true });

    add(d, 'jellyfin', 12002);
    bus.emit('app.stateChanged', { appId: 'jellyfin', state: 'running' } as never);
    await remote.reconcile();
    expect(Object.keys(ts.config.TCP!).sort()).toEqual(['12001', '12002', '443']);
    expect(ts.config.Web!['hari-home.tail9.ts.net:12002']).toEqual({
      Handlers: { '/': { Proxy: 'https+insecure://127.0.0.1:12002' } },
    });

    db.delete(apps).where(eq(apps.id, 'immich')).run();
    bus.emit('app.stateChanged', { appId: 'immich', state: 'uninstalling' } as never);
    await remote.reconcile();
    expect(Object.keys(ts.config.TCP!).sort()).toEqual(['12002', '443']);
    expect(ts.config.Web!['hari-home.tail9.ts.net:12001']).toBeUndefined();
  });

  it('does nothing while remote access is off', async () => {
    const d = await daemonWithAdmin(closers);
    add(d, 'immich', 12001);
    await d.services!.remote.reconcile();
    expect((d.services!.tailscale as FakeTailscale).config).toEqual({});
  });

  it("signed out on an app's tailnet address: log in on the tailnet dashboard, then back to the app", async () => {
    const d = await daemonWithAdmin(closers);
    add(d, 'vaultwarden', 12002);
    const ts = d.services!.tailscale as FakeTailscale;
    ts.current = {
      kind: 'running',
      tailnet: 'tail9.ts.net',
      nodeName: 'hari-home',
      httpsEnabled: true,
      keyExpiry: null,
    };
    await d.mutate('network.remote.connect', { confirmTailnet: true });
    const res = await fetch(`${d.url}/auth/verify`, {
      redirect: 'manual',
      headers: { 'x-forwarded-host': 'hari-home.tail9.ts.net:12002', 'x-forwarded-uri': '/', accept: 'text/html' },
    });
    expect(res.status).toBe(302);
    // Not hlabs.local: that name doesn't resolve away from home.
    expect(res.headers.get('location')).toBe(
      `https://hari-home.tail9.ts.net/login?next=${encodeURIComponent('https://hari-home.tail9.ts.net:12002/')}`,
    );
  });
});
