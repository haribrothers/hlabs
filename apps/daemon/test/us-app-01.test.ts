// US-APP-01 · Open an app in a window: what apps.get gives the window, and Caddy letting the dashboard frame an app
// that declares web.embed (D-038).
import { apps } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { buildCaddyConfig } from '../src/caddy/config';
import type { ProxyState } from '../src/caddy/index';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string } } };

const paths = {
  adminSocket: '/tmp/admin.sock',
  storageDir: '/data/caddy',
  logFile: '/data/logs/caddy.log',
  webFallbackDir: '/res/web-fallback',
};

function state(patch: Partial<ProxyState> = {}): ProxyState {
  return {
    hostname: 'hlabs',
    ports: { https: 443, http: 80 },
    onboardingComplete: true,
    dashboardUpstream: '127.0.0.1:7474',
    daemon: '127.0.0.1:7474',
    tailnetHost: null,
    apps: [
      { appId: 'jellyfin', hostname: 'jellyfin', port: 12000, auth: 'hlabs', embed: true },
      { appId: 'gitea', hostname: 'gitea', port: 12001, auth: 'hlabs', embed: false },
    ],
    ...patch,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- walking Caddy's JSON
const routeFor = (config: any, host: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config.apps.http.servers.https.routes.find((r: any) => r.match?.[0]?.host?.[0] === host);

describe('US-APP-01', () => {
  it('lets the dashboard frame an app that declares web.embed, and only that app', () => {
    const config = buildCaddyConfig(state(), paths);
    const framed = routeFor(config, 'jellyfin.hlabs.local').handle.at(-1);
    expect(framed.headers.response).toEqual({
      delete: ['X-Frame-Options'],
      add: { 'Content-Security-Policy': ['frame-ancestors https://hlabs.local'] },
    });
    expect(routeFor(config, 'gitea.hlabs.local').handle.at(-1).headers).toBeUndefined();
  });

  it('names the dashboard on its own port and on the tailnet as frame ancestors', () => {
    const config = buildCaddyConfig(
      state({ ports: { https: 8443, http: 8080 }, tailnetHost: 'hlabs.tail1234.ts.net' }),
      paths,
    );
    expect(routeFor(config, 'jellyfin.hlabs.local').handle.at(-1).headers.response.add).toEqual({
      'Content-Security-Policy': ['frame-ancestors https://hlabs.local:8443 https://hlabs.tail1234.ts.net'],
    });
  });

  it('apps.get gives the window its icon, state, address, frame path and whether it may frame', async () => {
    const t = await installDaemon(closers);
    const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
    await t.s.jobs.settled(res.result!.data.jobId as string);
    const get = (await t.d.query(
      `apps.get?input=${encodeURIComponent(JSON.stringify({ appId: 'uptime-kuma' }))}`,
    )) as Reply;
    expect(get.result!.data).toMatchObject({
      id: 'uptime-kuma',
      name: 'Uptime Kuma',
      state: 'running',
      address: 'uptime-kuma.hlabs.local',
      embed: true,
      webPath: '/',
      urls: { local: 'https://uptime-kuma.hlabs.local', tailnet: null },
      engineRunning: true,
      icon: { logoUrl: '/api/apps/uptime-kuma/assets/logo.svg' },
    });
    expect(t.s.db.select().from(apps).get()?.state).toBe('running');
  });
});
