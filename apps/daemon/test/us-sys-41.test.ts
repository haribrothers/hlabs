// US-SYS-41 · Reach hlabs through a subnet router (server side, D-107).
import { auditLog, getSetting, users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FakeTailscale } from '../src/tailscale/fake';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-SYS-41', () => {
  it("saves the subnet router mode, audited, and then doesn't ask Tailscale on this computer", async () => {
    const d = await daemonWithAdmin(closers);
    const ts = d.services!.tailscale as FakeTailscale;
    expect((await d.mutate('network.setRemoteMode', { mode: 'subnetRouter' })).result?.data).toEqual({ ok: true });
    expect(getSetting(d.services!.db, 'remote')).toMatchObject({ mode: 'subnetRouter', state: 'off' });
    expect(
      d.services!.db.select().from(auditLog).where(eq(auditLog.action, 'network.remote.mode')).get()?.detailJson,
    ).toEqual({ mode: 'subnetRouter' });

    const asked = vi.spyOn(ts, 'state');
    expect((await d.query('network.status')).result!.data.remote).toMatchObject({ mode: 'subnetRouter', url: null });
    await d.services!.remote.reconcile();
    expect(asked).not.toHaveBeenCalled();
  });

  it('invite links use the home-network address in this mode (D-109)', async () => {
    const d = await daemonWithAdmin(closers);
    await d.mutate('network.setRemoteMode', { mode: 'subnetRouter' });
    const made = (await d.mutate('invites.create', { role: 'member' })).result!.data;
    expect(made.url).toMatch(/^https:\/\/hlabs\.local\/invite\//);
    expect(made.homeUrl).toBeNull();
  });

  it('"Use Tailscale on this computer instead" goes back to Connect; a log-in in progress is given up', async () => {
    const d = await daemonWithAdmin(closers);
    await d.mutate('network.setRemoteMode', { mode: 'subnetRouter' });
    await d.mutate('network.setRemoteMode', { mode: 'off' });
    expect((await d.query('network.status')).result!.data.remote).toMatchObject({ mode: 'off', state: 'off' });
    const connect = (await d.mutate('network.remote.connect')).result!.data;
    expect(connect.state).toBe('needs_login');
    await d.mutate('network.setRemoteMode', { mode: 'subnetRouter' });
    expect(getSetting(d.services!.db, 'remote')).toMatchObject({ mode: 'subnetRouter', connectStartedAt: null });
  });

  it('refused while connected with Tailscale here; members get ACCESS_DENIED', async () => {
    const d = await daemonWithAdmin(closers);
    const ts = d.services!.tailscale as FakeTailscale;
    ts.current = {
      kind: 'running',
      tailnet: 'tail9.ts.net',
      nodeName: 'hari-home',
      httpsEnabled: true,
      keyExpiry: null,
    };
    await d.mutate('network.remote.connect', { confirmTailnet: true });
    expect((await d.mutate('network.setRemoteMode', { mode: 'subnetRouter' })).error?.data.hlabsCode).toBe(
      'VALIDATION_FAILED',
    );
    d.services!.db.update(users).set({ role: 'member' }).where(eq(users.id, d.userId)).run();
    expect((await d.mutate('network.setRemoteMode', { mode: 'off' })).error?.data.hlabsCode).toBe('ACCESS_DENIED');
  });
});
