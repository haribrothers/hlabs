// US-INST-02 · First launch hands off to onboarding in the browser: the daemon's side. tray.setupUrl gives the tray the
// tokenised setup URL until onboarding is complete, and the daemon serves the dashboard's build, so the URL opens
// OnbWelcome at http://127.0.0.1:7474/setup?token=… before Caddy is trusted.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { newTrayToken, TrayTokens } from '../src/auth/tray-token';
import { fileIn, registerDashboard } from '../src/http/dashboard';
import { startDaemon, tempDir } from './helpers';

const TOKEN = newTrayToken();
const trayTokens = () => new TrayTokens({ read: async () => TOKEN });

async function setupUrl(url: string) {
  const res = await fetch(`${url}/trpc/tray.setupUrl`, { headers: { authorization: `Bearer ${TOKEN}` } });
  return ((await res.json()) as { result: { data: { url: string | null; lanUrls: string[] } } }).result.data;
}

describe('US-INST-02 · First launch hands off to onboarding in the browser', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it('tray.setupUrl gives the tokenised setup URL until onboarding is complete, then null', async () => {
    const d = await startDaemon({ config: { devAnonymousAdmin: false }, trayTokens: trayTokens() });
    close = d.close;
    const first = await setupUrl(d.url);
    expect(first.url).toMatch(/^http:\/\/127\.0\.0\.1:5173\/setup\?token=[A-Za-z0-9_-]{43}$/);
    // Without Caddy there are no LAN addresses to offer.
    expect(first.lanUrls).toEqual([]);
    // Asking again gives the same URL ("Open setup" reopens it).
    expect((await setupUrl(d.url)).url).toBe(first.url);
    // The token in it is the one the dashboard's setup accepts.
    const token = new URL(first.url!).searchParams.get('token');
    expect(d.services!.onboarding.verifySetupToken(token)).toBe(true);

    await d.services!.onboarding.markComplete();
    expect(await setupUrl(d.url)).toEqual({ url: null, lanUrls: [] });
  });

  it("LAN setup URLs go through Caddy's HTTPS port at each LAN address (D-035)", async () => {
    const d = await startDaemon({ trayTokens: trayTokens() });
    close = d.close;
    const urls = await d.services!.onboarding.lanSetupUrls(['192.168.1.40', '10.0.0.5']);
    const token = new URL((await d.services!.onboarding.setupUrl())!).searchParams.get('token');
    expect(urls).toEqual([`https://192.168.1.40/setup?token=${token}`, `https://10.0.0.5/setup?token=${token}`]);
    await d.services!.onboarding.markComplete();
    expect(await d.services!.onboarding.lanSetupUrls(['192.168.1.40'])).toEqual([]);
  });

  it('refuses tray.setupUrl to anyone without the tray token', async () => {
    const d = await startDaemon({ config: { devAnonymousAdmin: false }, trayTokens: trayTokens() });
    close = d.close;
    const res = await fetch(`${d.url}/trpc/tray.setupUrl`);
    expect(res.status).toBe(401);
  });

  describe('the dashboard build', () => {
    function site() {
      const dir = tempDir();
      writeFileSync(join(dir, 'index.html'), '<!doctype html><title>hlabs</title>');
      mkdirSync(join(dir, 'assets'));
      writeFileSync(join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');
      writeFileSync(join(dir, 'favicon.svg'), '<svg/>');
      return dir;
    }

    async function serve(dir: string) {
      const app = Fastify();
      app.get('/trpc/system.health', async () => ({ ok: true }));
      const served = registerDashboard(app, dir);
      return { app, served };
    }

    it("serves index.html for the setup route, so the tray's URL opens OnbWelcome", async () => {
      const { app, served } = await serve(site());
      expect(served).toBe(true);
      const res = await app.inject({ url: '/setup?token=abc' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.body).toContain('<title>hlabs</title>');
      expect((await app.inject({ url: '/' })).body).toContain('<title>hlabs</title>');
      expect((await app.inject({ url: '/settings/network' })).statusCode).toBe(200);
    });

    it('serves files with their type; hashed assets are cached for good', async () => {
      const { app } = await serve(site());
      const js = await app.inject({ url: '/assets/index-abc123.js' });
      expect(js.statusCode).toBe(200);
      expect(js.headers['content-type']).toContain('text/javascript');
      expect(js.headers['cache-control']).toContain('immutable');
      expect((await app.inject({ url: '/favicon.svg' })).headers['content-type']).toBe('image/svg+xml');
    });

    it('answers 404 for a missing file and for unknown API paths, never the app', async () => {
      const { app } = await serve(site());
      expect((await app.inject({ url: '/assets/gone-123.js' })).statusCode).toBe(404);
      expect((await app.inject({ url: '/trpc/nothing' })).statusCode).toBe(404);
      expect((await app.inject({ url: '/api/nothing' })).statusCode).toBe(404);
      // A route that exists still answers.
      expect((await app.inject({ url: '/trpc/system.health' })).json()).toEqual({ ok: true });
    });

    it('never serves a file outside the build', async () => {
      const dir = site();
      expect(fileIn(dir, '/../secret')).toBeNull();
      expect(fileIn(dir, '/%2e%2e/secret')).toBeNull();
      expect(fileIn(dir, '/a%00b')).toBeNull();
      expect(fileIn(dir, '/%E0%A4%A')).toBeNull();
      expect(fileIn(dir, '/assets/x.js')).toBe(join(dir, 'assets', 'x.js'));
      const { app } = await serve(dir);
      const res = await app.inject({ url: '/..%2f..%2fetc%2fpasswd' });
      expect(res.body).not.toContain('root:');
    });

    it('serves nothing when there is no build (pnpm dev uses Vite)', async () => {
      const { app, served } = await serve(tempDir());
      expect(served).toBe(false);
      expect((await app.inject({ url: '/setup' })).statusCode).toBe(404);
    });
  });
});
