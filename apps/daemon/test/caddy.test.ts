// Caddy's config (02 §2.6, D-006), the NetworkService that applies it, and the admin socket path (D-073).
import { openDb, setSetting } from '@hlabs/db';
import { describe, expect, it } from 'vitest';
import type { AppRoute } from '../src/apps/service';
import { buildCaddyConfig, IDENTITY_HEADERS } from '../src/caddy/config';
import { NoopProxyManager, type ProxyManager, type ProxyState } from '../src/caddy/index';
import { adminSocketPath } from '../src/caddy/proxy';
import { EventBus } from '../src/events/bus';
import { silentLogger } from '../src/logger';
import { NoopMdnsPublisher } from '../src/mdns/index';
import { NetworkService } from '../src/network/service';
import { tempDir } from './helpers';

const paths = {
  storageDir: '/data/caddy/data',
  adminSocket: '/data/caddy/admin.sock',
  logFile: '/data/caddy/caddy.log',
  webFallbackDir: '/res/web-fallback',
};

function state(patch: Partial<ProxyState> = {}): ProxyState {
  return {
    hostname: 'hlabs',
    ports: { https: 443, http: 80 },
    onboardingComplete: true,
    dashboardUpstream: '127.0.0.1:7474',
    daemon: '127.0.0.1:7474',
    apps: [
      { appId: 'immich', hostname: 'immich', port: 12000, auth: 'hlabs' },
      { appId: 'vaultwarden', hostname: 'vaultwarden', port: 12001, auth: 'none' },
    ],
    ...patch,
  };
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('buildCaddyConfig', () => {
  const config = buildCaddyConfig(state(), paths) as Json;
  const https = config.apps.http.servers.https;
  const http = config.apps.http.servers.http;

  it('serves the dashboard and each app by host name over HTTPS from the internal CA', () => {
    expect(https.listen).toEqual([':443']);
    expect(https.routes.map((r: Json) => r.match[0].host[0])).toEqual([
      'hlabs.local',
      'immich.hlabs.local',
      'vaultwarden.hlabs.local',
    ]);
    expect(config.apps.tls.automation.policies).toEqual([
      {
        subjects: ['hlabs.local', 'immich.hlabs.local', 'vaultwarden.hlabs.local'],
        issuers: [{ module: 'internal' }],
      },
    ]);
    expect(config.apps.pki.certificate_authorities.local).toMatchObject({ install_trust: false });
    expect(config.storage).toEqual({ module: 'file_system', root: '/data/caddy/data' });
  });

  it('sends app traffic to the loopback port (D-049), through forward auth unless the app opted out', () => {
    const [, immich, vaultwarden] = https.routes;
    expect(immich.handle[0]).toEqual({ handler: 'headers', request: { delete: IDENTITY_HEADERS } });
    expect(immich.handle[1]).toMatchObject({
      handler: 'reverse_proxy',
      upstreams: [{ dial: '127.0.0.1:7474' }],
      rewrite: { method: 'GET', uri: '/auth/verify' },
    });
    expect(immich.handle[2]).toEqual({ handler: 'reverse_proxy', upstreams: [{ dial: '127.0.0.1:12000' }] });
    expect(vaultwarden.handle.map((h: Json) => h.handler)).toEqual(['headers', 'reverse_proxy']);
    expect(vaultwarden.handle[1].upstreams).toEqual([{ dial: '127.0.0.1:12001' }]);
  });

  it('drops identity headers a browser sends on the dashboard too', () => {
    expect(https.routes[0].handle[0]).toEqual({ handler: 'headers', request: { delete: IDENTITY_HEADERS } });
  });

  it('answers a down daemon with the fallback page on the dashboard only (US-STATE-04)', () => {
    expect(https.errors.routes[0].match).toEqual([{ host: ['hlabs.local'] }]);
    expect(JSON.stringify(https.errors.routes[0].handle)).toContain('/res/web-fallback');
  });

  it('after onboarding, port 80 serves /ca.crt and redirects everything else to HTTPS', () => {
    expect(http.listen).toEqual([':80']);
    expect(http.routes[0].match).toEqual([{ path: ['/ca.crt'] }]);
    expect(http.routes[1].handle[0]).toMatchObject({
      status_code: 308,
      headers: { Location: ['https://{http.request.host}{http.request.uri}'] },
    });
  });

  it('during onboarding, port 80 serves the dashboard under any name', () => {
    const onboarding = buildCaddyConfig(state({ onboardingComplete: false }), paths) as Json;
    const routes = onboarding.apps.http.servers.http.routes;
    expect(routes[1].match).toBeUndefined();
    expect(routes[1].handle.at(-1)).toEqual({ handler: 'reverse_proxy', upstreams: [{ dial: '127.0.0.1:7474' }] });
  });

  it('uses the fallback ports and keeps them in redirects (D-016)', () => {
    const c = buildCaddyConfig(state({ ports: { https: 8443, http: 8080 } }), paths) as Json;
    expect(c.apps.http.servers.https.listen).toEqual([':8443']);
    expect(c.apps.http.servers.http.routes[1].handle[0].headers.Location).toEqual([
      'https://{http.request.host}:8443{http.request.uri}',
    ]);
  });

  it('keeps the admin API on a unix socket', () => {
    expect(config.admin).toEqual({ listen: 'unix//data/caddy/admin.sock', config: { persist: false } });
  });
});

describe('adminSocketPath', () => {
  it('uses the data directory unless the path is too long for a socket', () => {
    expect(adminSocketPath('/data/caddy')).toBe('/data/caddy/admin.sock');
    const long = adminSocketPath(`/data/${'x'.repeat(120)}/caddy`);
    expect(long).toMatch(/^\/tmp\/hlabs-[^/]+\/caddy-[a-f0-9]{12}\.sock$/);
    expect(Buffer.byteLength(long)).toBeLessThan(100);
  });
});

describe('NetworkService', () => {
  function setup(proxy: ProxyManager = new NoopProxyManager()) {
    const db = openDb({ dataDir: tempDir() });
    const mdns = new NoopMdnsPublisher();
    let routes: AppRoute[] = [];
    const errors: unknown[] = [];
    const logger = { ...silentLogger(), error: (o: unknown) => void errors.push(o) } as ReturnType<typeof silentLogger>;
    const network = new NetworkService({
      db,
      proxy,
      mdns,
      logger,
      routes: () => routes,
      dashboardUpstream: '127.0.0.1:5173',
      daemon: '127.0.0.1:7474',
    });
    return { db, mdns, network, errors, setRoutes: (r: AppRoute[]) => (routes = r) };
  }

  it('applies the state from the database and publishes the names', async () => {
    const proxy = new NoopProxyManager();
    const t = setup(proxy);
    setSetting(t.db, 'network', { ports: { https: 8443, http: 8080 }, piholeDns: false });
    t.setRoutes([{ appId: 'immich', hostname: 'immich', port: 12000, auth: 'hlabs' }]);
    await t.network.sync();
    expect(proxy.last).toEqual({
      hostname: 'hlabs',
      ports: { https: 8443, http: 8080 },
      onboardingComplete: false,
      dashboardUpstream: '127.0.0.1:5173',
      daemon: '127.0.0.1:7474',
      apps: [{ appId: 'immich', hostname: 'immich', port: 12000, auth: 'hlabs' }],
    });
    expect(t.mdns.names).toEqual(['hlabs.local', 'immich.hlabs.local']);
  });

  it('only applies again when something changed, and follows app state changes', async () => {
    let applies = 0;
    const t = setup({ apply: async () => void applies++, stop: async () => {} });
    const bus = new EventBus();
    t.network.watch(bus);
    await t.network.sync();
    await t.network.sync();
    expect(applies).toBe(1);
    t.setRoutes([{ appId: 'gitea', hostname: 'gitea', port: 12004, auth: 'hlabs' }]);
    bus.emit('app.stateChanged', { appId: 'gitea', state: 'running', detail: null });
    await t.network.sync();
    expect(applies).toBe(2);
    await t.network.sync({ force: true });
    expect(applies).toBe(3);
  });

  it('logs a failure instead of throwing, and tries again next time', async () => {
    let fail = true;
    const t = setup({
      apply: async () => {
        if (fail) throw new Error('caddy missing');
      },
      stop: async () => {},
    });
    await t.network.sync();
    expect(t.errors).toHaveLength(1);
    expect(t.mdns.names).toEqual([]);
    fail = false;
    await t.network.sync();
    expect(t.mdns.names).toEqual(['hlabs.local']);
  });
});
