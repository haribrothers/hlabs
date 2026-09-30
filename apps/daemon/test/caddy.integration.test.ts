// The real Caddy (from `pnpm fetch-binaries`) with the config hlabs builds: dashboard, forward auth, an app that
// opted out, the CA certificate, the port 80 redirect and the fallback page. Skipped when .bin/caddy isn't there.
import { LOOPBACK_OFFSET } from '../src/apps/ports';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { request } from 'node:https';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProxyState } from '../src/caddy/index';
import { CaddyProxy } from '../src/caddy/proxy';
import { silentLogger } from '../src/logger';
import { tempDir } from './helpers';

const CADDY = fileURLToPath(new URL('../../../.bin/caddy', import.meta.url));

async function serve(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<[Server, number]> {
  const server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return [server, (server.address() as AddressInfo).port];
}

async function freePort(): Promise<number> {
  const [server, port] = await serve(() => {});
  await new Promise((r) => server.close(r));
  return port;
}

interface Reply {
  status: number;
  headers: IncomingMessage['headers'];
  body: string;
}

function get(
  port: number,
  host: string,
  options: { method?: string; headers?: Record<string, string>; ca?: string } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        servername: host,
        path: '/photos?x=1',
        method: options.method ?? 'GET',
        headers: { Host: `${host}:${port}`, ...options.headers },
        ...(options.ca ? { ca: options.ca } : { rejectUnauthorized: false }),
      },
      (res) => {
        let body = '';
        res.on('data', (c: Buffer) => (body += c.toString()));
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function plain(port: number, path: string, host = 'demo.hlabs.local'): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, headers: { Host: host }, agent: false }, (res) => {
      let body = '';
      res.on('data', (c: Buffer) => (body += c.toString()));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** Caddy issues certificates just after a config loads; wait until each host completes a TLS handshake. */
async function certificatesReady(port: number, hosts: string[]) {
  const deadline = Date.now() + 15_000;
  for (const host of hosts) {
    for (;;) {
      try {
        await get(port, host);
        break;
      } catch (error) {
        if (Date.now() > deadline) throw error;
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }
}

describe.skipIf(!existsSync(CADDY))('Caddy with the hlabs config', () => {
  const servers: Server[] = [];
  let proxy: CaddyProxy;
  let state: ProxyState;
  const verifyCalls: Array<Record<string, string | undefined>> = [];

  beforeAll(async () => {
    const dir = tempDir();
    const fallback = join(dir, 'fallback');
    mkdirSync(fallback);
    writeFileSync(join(fallback, 'index.html'), '<h1>fallback</h1>');
    const [dashboard, dashboardPort] = await serve((req, res) =>
      res.end(`dashboard user=${req.headers['x-hlabs-user'] ?? '-'}`),
    );
    const [daemon, daemonPort] = await serve((req, res) => {
      verifyCalls.push({
        url: req.url,
        method: req.headers['x-forwarded-method'] as string,
        uri: req.headers['x-forwarded-uri'] as string,
        host: req.headers['x-forwarded-host'] as string,
      });
      if ((req.headers.cookie ?? '').includes('s=ok')) {
        res.setHeader('X-Hlabs-User', 'hari');
        res.setHeader('X-Hlabs-Role', 'admin');
        res.end();
      } else {
        res.writeHead(302, { Location: 'https://hlabs.local/login' }).end();
      }
    });
    const [app, appPort] = await serve((req, res) =>
      res.end(`app user=${req.headers['x-hlabs-user']} role=${req.headers['x-hlabs-role']} ${req.method} ${req.url}`),
    );
    servers.push(dashboard, daemon, app);
    state = {
      hostname: 'hlabs',
      ports: { https: await freePort(), http: await freePort() },
      onboardingComplete: false,
      dashboardUpstream: `127.0.0.1:${dashboardPort}`,
      daemon: `127.0.0.1:${daemonPort}`,
      tailnetHost: null,
      apps: [
        { appId: 'demo', hostname: 'demo', port: appPort - LOOPBACK_OFFSET, auth: 'hlabs', embed: false },
        { appId: 'open', hostname: 'open', port: appPort - LOOPBACK_OFFSET, auth: 'none', embed: false },
      ],
    };
    proxy = new CaddyProxy({
      binary: CADDY,
      dir: join(dir, 'caddy'),
      webFallbackDir: fallback,
      logger: silentLogger(),
    });
    await proxy.apply(state);
    await certificatesReady(state.ports.https, ['hlabs.local', 'demo.hlabs.local', 'open.hlabs.local']);
    verifyCalls.length = 0;
  }, 30_000);

  afterAll(async () => {
    await proxy?.stop();
    for (const s of servers) s.close();
  });

  it('proxies the dashboard and drops identity headers the browser sent', async () => {
    const res = await get(state.ports.https, 'hlabs.local', { headers: { 'X-Hlabs-User': 'evil' } });
    expect(res.body).toBe('dashboard user=-');
  });

  it('sends a signed-out visitor where /auth/verify says', async () => {
    const res = await get(state.ports.https, 'demo.hlabs.local');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://hlabs.local/login');
    expect(verifyCalls.at(-1)).toMatchObject({
      method: 'GET',
      uri: '/photos?x=1',
      host: `demo.hlabs.local:${state.ports.https}`,
    });
    expect(verifyCalls.at(-1)!.url).toMatch(/^\/auth\/verify/);
  });

  it('passes a signed-in request on with the user from /auth/verify, not the browser', async () => {
    const res = await get(state.ports.https, 'demo.hlabs.local', {
      method: 'POST',
      headers: { Cookie: 's=ok', 'X-Hlabs-Role': 'spoofed' },
    });
    expect(res.body).toBe('app user=hari role=admin POST /photos?x=1');
  });

  it('skips forward auth for an app that opted out', async () => {
    const res = await get(state.ports.https, 'open.hlabs.local', { headers: { 'X-Hlabs-User': 'evil' } });
    expect(res.body).toBe('app user=undefined role=undefined GET /photos?x=1');
  });

  it('serves the CA certificate, which verifies the app certificates', async () => {
    const ca = await plain(state.ports.http, '/ca.crt');
    expect(ca.headers['content-type']).toBe('application/x-x509-ca-cert');
    expect(ca.body).toMatch(/^-----BEGIN CERTIFICATE-----/);
    const res = await get(state.ports.https, 'open.hlabs.local', { ca: ca.body });
    expect(res.status).toBe(200);
  });

  it('serves the dashboard on port 80 during onboarding, then redirects to HTTPS', async () => {
    expect((await plain(state.ports.http, '/', '192.168.1.20')).body).toBe('dashboard user=-');
    await proxy.apply({ ...state, onboardingComplete: true });
    const res = await plain(state.ports.http, '/x?y=1');
    expect(res.status).toBe(308);
    expect(res.headers.location).toBe(`https://demo.hlabs.local:${state.ports.https}/x?y=1`);
  });

  it('shows the fallback page when the dashboard upstream is down (US-STATE-04)', async () => {
    await proxy.apply({ ...state, onboardingComplete: true, dashboardUpstream: `127.0.0.1:${await freePort()}` });
    const page = await get(state.ports.https, 'hlabs.local');
    expect(page.status).toBe(503);
    expect(page.body).toBe('<h1>fallback</h1>');
  });
});
