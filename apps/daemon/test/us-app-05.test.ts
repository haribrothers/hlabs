// US-APP-05 · App address and tailnet address: apps.get gives the app's name, or its own port on hlabs.local while
// its name can't be published, and its tailnet address when remote access is on. Caddy serves every app on its own
// port (D-086), and forward auth and log in know an app reached that way.
import { apps, setSetting } from '@hlabs/db';
import { nextOrigins } from '@hlabs/shared';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { buildCaddyConfig } from '../src/caddy/config';
import { silentLogger } from '../src/logger';
import type { NoopMdnsPublisher } from '../src/mdns/index';
import { avahiCommand, ProcessMdnsPublisher, type Child } from '../src/mdns/publisher';
import { daemonWithAdmin } from './admin-session';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> } };

async function installed() {
  const t = await installDaemon(closers);
  const res = (await t.d.mutate('apps.install', { appId: 'vaultwarden' })) as Reply;
  await t.s.jobs.settled(res.result!.data.jobId as string);
  const port = t.s.db.select().from(apps).get()!.portFallback!;
  const urls = async () =>
    ((await t.d.query(`apps.get?input=${encodeURIComponent(JSON.stringify({ appId: 'vaultwarden' }))}`)) as Reply)
      .result!.data.urls;
  return { ...t, port, urls };
}

class FakeChild extends EventEmitter implements Child {
  kill() {
    this.emit('exit', null);
    return true;
  }
}

describe('US-APP-05', () => {
  it("the app's address is its name; while the name can't be published, https://hlabs.local:<port>", async () => {
    const t = await installed();
    expect(await t.urls()).toEqual({ local: 'https://vaultwarden.hlabs.local', tailnet: null });
    (t.s.mdns as NoopMdnsPublisher).failing.add('vaultwarden.hlabs.local');
    expect(await t.urls()).toEqual({ local: `https://hlabs.local:${t.port}`, tailnet: null });
    const list = (await t.d.query('apps.list')) as { result: { data: { apps: Array<{ urls: unknown }> } } };
    expect(list.result.data.apps[0]!.urls).toEqual({ local: `https://hlabs.local:${t.port}`, tailnet: null });
  });

  it('with remote access on, the tailnet address is the tailnet app port on the dashboard tailnet name (D-012, D-110)', async () => {
    const t = await installed();
    setSetting(t.s.db, 'remote', { tailnetName: 'tail1234.ts.net' } as never);
    expect(await t.urls()).toEqual({
      local: 'https://vaultwarden.hlabs.local',
      tailnet: `https://hlabs.tail1234.ts.net:${t.port + 2000}`,
    });
  });

  it('Caddy serves each app on its own port under any name, with TLS and forward auth', () => {
    const state = {
      hostname: 'hlabs',
      ports: { https: 443, http: 80 },
      onboardingComplete: true,
      dashboardUpstream: '127.0.0.1:5173',
      daemon: '127.0.0.1:7474',
      tailnetHost: null,
      apps: [{ appId: 'vaultwarden', hostname: 'vaultwarden', port: 12003, auth: 'hlabs' as const, embed: true }],
    };
    const paths = { storageDir: '/d', adminSocket: '/a.sock', logFile: '/c.log', webFallbackDir: '/w' };
    const servers = buildCaddyConfig(state, paths).apps.http.servers as Record<string, Record<string, unknown>>;
    const server = servers['app-vaultwarden']!;
    expect(server.listen).toEqual([':12003']);
    expect(server.tls_connection_policies).toEqual([{ default_sni: 'hlabs.local' }]);
    const [route] = server.routes as Array<{
      match?: unknown;
      handle: Array<{ handler: string; upstreams?: unknown }>;
    }>;
    expect(route!.match).toBeUndefined();
    expect(route!.handle.at(-1)!.upstreams).toEqual([{ dial: '127.0.0.1:13003' }]);
    expect(route!.handle.some((h) => h.handler === 'reverse_proxy' && JSON.stringify(h).includes('/auth/verify'))).toBe(
      true,
    );
    // When another program holds one of the ports, the apps are served on their names only.
    const named = buildCaddyConfig(state, paths, { appPorts: false }).apps.http.servers;
    expect(Object.keys(named)).toEqual(['https', 'http']);
  });

  it('forward auth knows an app reached on its own port, and sends log in to the dashboard', async () => {
    const d = await daemonWithAdmin(closers);
    d.services!.db.insert(apps)
      .values({
        id: 'vaultwarden',
        version: '1',
        state: 'running',
        hostname: 'vaultwarden',
        portFallback: 12003,
        authMode: 'hlabs',
        installedAt: 1,
        updatedAt: 1,
      })
      .run();
    const verify = (cookie?: string) =>
      fetch(`${d.url}/auth/verify`, {
        redirect: 'manual',
        headers: {
          'x-forwarded-host': 'hlabs.local:12003',
          'x-forwarded-uri': '/vault',
          accept: 'text/html',
          ...(cookie ? { cookie } : {}),
        },
      });
    expect((await verify(d.cookie)).status).toBe(200);
    const signedOut = await verify();
    expect(signedOut.status).toBe(302);
    expect(signedOut.headers.get('location')).toBe(
      `https://hlabs.local/login?next=${encodeURIComponent('https://hlabs.local:12003/vault')}`,
    );
  });

  it('log in may return to an app at its own port', () => {
    const origins = nextOrigins({
      dashboardUrl: 'https://hlabs.local',
      hostname: 'hlabs',
      apps: [{ hostname: 'vaultwarden', port: 12003 }],
      tailnet: null,
    });
    expect(origins.has('https://hlabs.local:12003')).toBe(true);
  });

  it("a name whose publisher stops right after it starts isn't published until one stays up", () => {
    let clock = 0;
    const children: FakeChild[] = [];
    const publisher = new ProcessMdnsPublisher({
      logger: silentLogger(),
      command: avahiCommand,
      address: () => '192.168.1.20',
      spawn: () => {
        const child = new FakeChild();
        children.push(child);
        return child;
      },
      restartDelayMs: 60_000,
      addressCheckMs: 60_000,
      stableMs: 10_000,
      now: () => clock,
    });
    void publisher.sync(['vaultwarden.hlabs.local']);
    expect(publisher.isPublished('vaultwarden.hlabs.local')).toBe(true);
    clock = 500;
    children[0]!.emit('exit', 1); // "Local name collision"
    expect(publisher.isPublished('vaultwarden.hlabs.local')).toBe(false);
    void publisher.sync(['vaultwarden.hlabs.local']);
    expect(publisher.isPublished('vaultwarden.hlabs.local')).toBe(false);
    void publisher.unpublishAll();
  });

  it('nothing is published without a LAN address', () => {
    const publisher = new ProcessMdnsPublisher({
      logger: silentLogger(),
      command: avahiCommand,
      address: () => null,
      spawn: () => new FakeChild(),
      addressCheckMs: 60_000,
    });
    void publisher.sync(['vaultwarden.hlabs.local']);
    expect(publisher.isPublished('vaultwarden.hlabs.local')).toBe(false);
    void publisher.unpublishAll();
  });
});
