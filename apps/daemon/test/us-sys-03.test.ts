// US-SYS-03 · Disconnect remote access (server side).
import { apps, auditLog, getSetting, sessions } from '@hlabs/db';
import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { isTailnetIp } from '../src/network/remote';
import type { FakeTailscale } from '../src/tailscale/fake';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function connected() {
  const d = await daemonWithAdmin(closers);
  const ts = d.services!.tailscale as FakeTailscale;
  d.services!.db.insert(apps)
    .values({
      id: 'immich',
      version: '1',
      state: 'running',
      hostname: 'immich',
      portFallback: 12001,
      installedAt: 1,
      updatedAt: 1,
    })
    .run();
  ts.current = { kind: 'running', tailnet: 'tail9.ts.net', nodeName: 'hari-home', httpsEnabled: true, keyExpiry: null };
  // Something of the person's own, served on another port.
  ts.config = {
    TCP: { '3000': { HTTPS: true } },
    Web: { 'hari-home.tail9.ts.net:3000': { Handlers: { '/': { Proxy: 'http://127.0.0.1:3000' } } } },
  };
  await d.mutate('network.remote.connect', { confirmTailnet: true });
  return { d, ts };
}

describe('US-SYS-03', () => {
  it("removes only hlabs's Serve entries, leaves Tailscale signed in, and shows Not connected", async () => {
    const { d, ts } = await connected();
    expect(Object.keys(ts.config.TCP!).sort()).toEqual(['14001', '3000', '443']);
    expect((await d.mutate('network.remote.disconnect')).result?.data).toEqual({ ok: true });
    expect(ts.config).toEqual({
      TCP: { '3000': { HTTPS: true } },
      Web: { 'hari-home.tail9.ts.net:3000': { Handlers: { '/': { Proxy: 'http://127.0.0.1:3000' } } } },
    });
    expect(ts.current.kind).toBe('running');
    expect((await d.query('network.status')).result!.data.remote).toMatchObject({ state: 'off', url: null });
    expect(getSetting(d.services!.db, 'remote')).toMatchObject({
      mode: 'off',
      state: 'off',
      serve: [],
      tailnetName: null,
    });
    expect(
      d.services!.db.select().from(auditLog).where(eq(auditLog.action, 'network.remote.disconnect')).get(),
    ).toBeDefined();
  });

  it('ends the sessions that came over the tailnet, and only those', async () => {
    const { d } = await connected();
    const s = d.services!;
    s.sessions.create({ userId: d.userId, ip: '100.101.1.2' });
    s.sessions.create({ userId: d.userId, ip: 'fd7a:115c:a1e0::9' });
    s.sessions.create({ userId: d.userId, ip: '192.168.1.20' });
    await d.mutate('network.remote.disconnect');
    const live = s.db
      .select({ ip: sessions.ip })
      .from(sessions)
      .where(and(isNull(sessions.revokedAt)))
      .all()
      .map((r) => r.ip);
    expect(live).not.toContain('100.101.1.2');
    expect(live).not.toContain('fd7a:115c:a1e0::9');
    expect(live).toContain('192.168.1.20');
  });

  it('needs Tailscale running to take the entries away', async () => {
    const { d, ts } = await connected();
    ts.serveConfig = async () => {
      throw new (await import('../src/tailscale/types')).TailscaleError('unavailable', 'gone');
    };
    expect((await d.mutate('network.remote.disconnect')).error?.data.hlabsCode).toBe('TAILSCALE_NOT_RUNNING');
  });

  it('knows tailnet addresses', () => {
    expect(isTailnetIp('100.64.0.1')).toBe(true);
    expect(isTailnetIp('100.127.255.254')).toBe(true);
    expect(isTailnetIp('::ffff:100.100.1.1')).toBe(true);
    expect(isTailnetIp('100.128.0.1')).toBe(false);
    expect(isTailnetIp('192.168.1.20')).toBe(false);
    expect(isTailnetIp('fd7a:115c:a1e0::1')).toBe(true);
    expect(isTailnetIp(null)).toBe(false);
  });
});
