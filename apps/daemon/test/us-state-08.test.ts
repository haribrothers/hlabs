// US-STATE-08 · Grey out Home when the engine has stopped (the daemon's side): the admins are told once, app addresses
// show the engine-stopped page instead of Caddy's 502, and apps.state isn't rewritten.
import { apps, notifications, setSetting, getSetting } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { buildCaddyConfig } from '../src/caddy/config';
import { ENGINE_STOPPED_KIND } from '../src/engine/watch';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function running() {
  const t = await installDaemon(closers);
  const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as { result: { data: { jobId: string } } };
  await t.s.jobs.settled(res.result.data.jobId);
  // Setup is done, as on any hlabs people use.
  setSetting(t.s.db, 'onboarding', { ...getSetting(t.s.db, 'onboarding'), completedAt: Date.now() });
  const stopped = () => t.s.db.select().from(notifications).where(eq(notifications.kind, ENGINE_STOPPED_KIND)).all();
  const stop = async () => {
    t.engine.running = false;
    await t.s.engine.check();
  };
  return { ...t, stopped, stop };
}

describe('US-STATE-08', () => {
  it('the engine stopping tells the admins once, as a critical notification', async () => {
    const t = await running();
    await t.stop();
    expect(t.stopped()).toEqual([
      expect.objectContaining({
        userId: null,
        severity: 'critical',
        title: 'The container engine has stopped',
        body: 'All apps are offline. Your data is safe.',
        readAt: null,
      }),
    ]);
    // Retries (and another stop before it's read) don't add more.
    t.s.bus.emit('engine.status', { running: false, kind: 'orbstack', managedByHlabs: false, socketPath: '/x' });
    await t.s.engine.check();
    expect(t.stopped()).toHaveLength(1);
  });

  it("apps keep their state while it's down: the dashboard shows them offline", async () => {
    const t = await running();
    await t.stop();
    expect(t.s.db.select().from(apps).get()?.state).toBe('running');
  });

  it('before setup is done nobody is told (setup handles the engine itself)', async () => {
    const t = await running();
    setSetting(t.s.db, 'onboarding', { ...getSetting(t.s.db, 'onboarding'), completedAt: null });
    await t.stop();
    expect(t.stopped()).toEqual([]);
  });

  it("an app's address shows the engine-stopped page while the engine is down, and the 502 otherwise", async () => {
    const t = await running();
    const unavailable = () =>
      fetch(`${t.d.url}/auth/unavailable`, {
        headers: { accept: 'text/html', 'x-forwarded-host': 'uptime-kuma.hlabs.local' },
      });
    expect((await unavailable()).status).toBe(502);
    await t.stop();
    const page = await unavailable();
    expect(page.status).toBe(503);
    const html = await page.text();
    expect(html).toContain('The container engine has stopped');
    expect(html).toContain('"kind":"engineStopped"');
    expect(html).toContain('"homeUrl":"https://hlabs.local/"');
  });

  it("Caddy hands an app's 502–504 to the daemon, on its name and on its own port", () => {
    const config = buildCaddyConfig(
      {
        hostname: 'hlabs',
        ports: { https: 443, http: 80 },
        onboardingComplete: true,
        dashboardUpstream: '127.0.0.1:5173',
        daemon: '127.0.0.1:7474',
        tailnetHost: null,
        apps: [{ appId: 'kuma', hostname: 'kuma', port: 12003, auth: 'hlabs', embed: false }],
      },
      { storageDir: '/d', adminSocket: '/a.sock', logFile: '/c.log', webFallbackDir: '/w' },
    );
    const servers = config.apps.http.servers as Record<string, { errors?: { routes: unknown[] } }>;
    const byName = JSON.stringify(servers.https!.errors!.routes);
    expect(byName).toContain('"host":["kuma.hlabs.local"]');
    expect(byName).toContain('/auth/unavailable');
    expect(JSON.stringify(servers['app-kuma']!.errors!.routes)).toContain('/auth/unavailable');
  });
});
