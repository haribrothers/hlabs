// US-APP-19 · Require hlabs login in front of an app: apps.setAuthMode changes the Caddy route at once (forward auth
// on or off), with no restart, and writes the audit log. It starts from the manifest's `web.auth` (`none` → off);
// `ownLogin` comes with the config. While it's on, a member without access gets 403 from /auth/verify.
import { apps } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { buildCaddyConfig } from '../src/caddy/config';
import type { NoopProxyManager } from '../src/caddy/index';
import { settingsApp } from './config-fixture';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const route = (t: Awaited<ReturnType<typeof settingsApp>>) =>
  (t.s.proxy as NoopProxyManager).last!.apps.find((a) => a.appId === 'vaultwarden')!;

describe('US-APP-19', () => {
  it("is on by default, with the app's own login said", async () => {
    const t = await settingsApp(closers);
    expect(((await t.config()) as { auth: unknown }).auth).toEqual({ mode: 'hlabs', ownLogin: true });
    expect(route(t).auth).toBe('hlabs');
  });

  it('turned off, the route drops forward auth at once, without a restart, audited', async () => {
    const t = await settingsApp(closers);
    const calls = t.compose.calls.length;
    const reply = await t.d.mutate('apps.setAuthMode', { appId: 'vaultwarden', mode: 'none' });
    expect(reply.result?.data).toEqual({ ok: true });
    expect(t.row().authMode).toBe('none');
    expect(route(t).auth).toBe('none');
    expect(t.compose.calls.length).toBe(calls);
    expect(t.row().state).toBe('running');
    expect(t.audits('app.setAuthMode')).toEqual([
      expect.objectContaining({ target: 'vaultwarden', detailJson: { from: 'hlabs', to: 'none' } }),
    ]);
    // In Caddy's config, the app's route has no forward auth any more.
    const appRouteJson = () => {
      const config = buildCaddyConfig((t.s.proxy as NoopProxyManager).last!, {
        storageDir: '/caddy',
        adminSocket: '/caddy/admin.sock',
        logFile: '/caddy/log',
      } as never);
      const routes = JSON.stringify(config).match(
        /\{"match":\[\{"host":\["vaultwarden\.hlabs\.local".*?"terminal":true\}/,
      );
      return routes?.[0] ?? '';
    };
    expect(appRouteJson()).not.toBe('');
    expect(appRouteJson()).not.toContain('/auth/verify');

    await t.d.mutate('apps.setAuthMode', { appId: 'vaultwarden', mode: 'hlabs' });
    expect(route(t).auth).toBe('hlabs');
    expect(appRouteJson()).toContain('/auth/verify');
    expect(t.audits('app.setAuthMode')).toHaveLength(2);
  });

  it('starts off for an app whose manifest says web.auth: none', async () => {
    const t = await settingsApp(closers);
    // As an install of such an app writes it (US-STORE-11: auth_mode from web.auth).
    t.s.db.update(apps).set({ authMode: 'none' }).where(eq(apps.id, 'vaultwarden')).run();
    expect(((await t.config()) as { auth: { mode: string } }).auth.mode).toBe('none');
  });

  it('while on, a member without access gets 403 from /auth/verify', async () => {
    const t = await settingsApp(closers);
    const anu = await memberSession(t.d, { appIds: [] });
    const verify = async () =>
      (
        await fetch(`${t.d.url}/auth/verify`, {
          headers: {
            'x-forwarded-host': 'vaultwarden.hlabs.local',
            'x-forwarded-uri': '/',
            accept: 'application/json',
            cookie: anu.cookie,
          },
        })
      ).status;
    expect(await verify()).toBe(403);
  });

  it('members get FORBIDDEN', async () => {
    const t = await settingsApp(closers);
    const anu = await memberSession(t.d, { appIds: ['vaultwarden'] });
    expect((await anu.mutate('apps.setAuthMode', { appId: 'vaultwarden', mode: 'none' })).status).toBe(403);
    expect(t.row().authMode).toBe('hlabs');
  });
});
