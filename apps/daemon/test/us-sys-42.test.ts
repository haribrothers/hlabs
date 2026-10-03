// US-SYS-42 · See why hlabs can't serve its address (server side): Caddy failing because another program holds its
// port becomes a port problem (with Tailscale Serve named when it's an entry hlabs didn't make), a critical
// notification while it lasts, tray.status.portProblem with the local dashboard address, and "Use port 8443".
import { auditLog, getSetting, notifications, setSetting } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { newTrayToken, TrayTokens } from '../src/auth/tray-token';
import type { ProxyManager, ProxyState } from '../src/caddy/index';
import { portInUse } from '../src/caddy/proxy';
import { NotificationService } from '../src/notifications/service';
import { notifyPortProblem, PORT_IN_USE_KIND, tailscaleServeHolds } from '../src/network/port-problem';
import { EventBus } from '../src/events/bus';
import { FakeTailscale } from '../src/tailscale/fake';
import { startDaemon } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

/** A Caddy whose web port is held until `free()`. */
class HeldProxy implements ProxyManager {
  held: number | null = 443;
  last: ProxyState | null = null;
  async apply(state: ProxyState) {
    this.last = state;
    if (this.held !== null && state.ports.https === this.held) throw new Error('caddy exited at start');
  }
  async stop() {}
  problem() {
    return this.held !== null && this.last?.ports.https === this.held ? { port: this.held } : null;
  }
}

const TOKEN = newTrayToken();
async function tray(url: string, path: string, mutation = false) {
  const res = await fetch(`${url}/trpc/${path}${mutation ? '?batch=1' : ''}`, {
    method: mutation ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    ...(mutation ? { body: '{}' } : {}),
  });
  const body = (await res.json()) as unknown;
  return (mutation ? (body as unknown[])[0] : body) as { result?: { data: Record<string, unknown> }; error?: unknown };
}

describe('US-SYS-42 · See why hlabs can’t serve its address', () => {
  it('reads the port from Caddy saying it is in use', () => {
    expect(portInUse('Error: listening on :443: listen tcp :443: bind: address already in use')).toBe(443);
    expect(portInUse('listen tcp 0.0.0.0:80: bind: address already in use')).toBe(80);
    expect(portInUse('some other failure')).toBeNull();
  });

  it('names Tailscale Serve only for an entry hlabs did not make', async () => {
    const d = await startDaemon();
    closers.push(d.close);
    const db = d.services!.db;
    const tailscale = new FakeTailscale();
    expect(await tailscaleServeHolds(443, { db, tailscale })).toBeNull();
    tailscale.config = { TCP: { '443': { HTTPS: true } } };
    expect(await tailscaleServeHolds(443, { db, tailscale })).toBe('tailscaleServe');
    setSetting(db, 'remote', { ...getSetting(db, 'remote'), serve: [443] });
    expect(await tailscaleServeHolds(443, { db, tailscale })).toBeNull();
  });

  it('a critical notification for admins while it lasts, read once hlabs serves again', async () => {
    const d = await startDaemon();
    closers.push(d.close);
    const db = d.services!.db;
    const service = new NotificationService(db, new EventBus());
    notifyPortProblem({ db, notifications: service }, { port: 443, heldBy: 'tailscaleServe' });
    const note = db.select().from(notifications).where(eq(notifications.kind, PORT_IN_USE_KIND)).get();
    expect(note).toMatchObject({
      userId: null,
      severity: 'critical',
      title: "hlabs can't use port 443",
      body: "Tailscale Serve is using it, so other devices can't reach hlabs. Use port 8443 instead, or turn off that Serve entry.",
      actionJson: [{ kind: 'navigate', to: '/settings/network' }],
      readAt: null,
    });
    notifyPortProblem({ db, notifications: service }, null);
    expect(
      db.select().from(notifications).where(eq(notifications.kind, PORT_IN_USE_KIND)).get()?.readAt,
    ).not.toBeNull();
  });

  it('tray.status says which port and what holds it; Open Dashboard uses this computer’s address; Use port 8443 moves hlabs', async () => {
    const proxy = new HeldProxy();
    const tailscale = new FakeTailscale();
    tailscale.config = { TCP: { '443': { HTTPS: true } } };
    const d = await startDaemon({
      config: { devAnonymousAdmin: false, proxy: 'caddy' },
      trayTokens: new TrayTokens({ read: async () => TOKEN }),
      boot: { proxy, tailscale },
    });
    closers.push(d.close);
    const s = d.services!;
    expect(s.routing.portProblem()).toEqual({ port: 443, heldBy: 'tailscaleServe' });
    const status = (await tray(d.url, 'tray.status')).result!.data;
    expect(status.portProblem).toEqual({ port: 443, heldBy: 'tailscaleServe', fallbackPort: 8443 });
    expect(status.dashboardUrl).toBe(`http://127.0.0.1:${s.config.port}`);
    expect(s.db.select().from(notifications).where(eq(notifications.kind, PORT_IN_USE_KIND)).get()?.severity).toBe(
      'critical',
    );

    expect((await tray(d.url, 'tray.useOtherPort', true)).result?.data).toEqual({ ok: true });
    expect(getSetting(s.db, 'network').ports.https).toBe(8443);
    expect(s.routing.portProblem()).toBeNull();
    const audit = s.db.select().from(auditLog).where(eq(auditLog.action, 'network.setPorts')).get();
    expect(audit).toMatchObject({ userId: null, detailJson: { to: { https: 8443, http: 80 } } });
    expect((await tray(d.url, 'tray.status')).result!.data.portProblem).toBeNull();
    expect(
      s.db.select().from(notifications).where(eq(notifications.kind, PORT_IN_USE_KIND)).get()?.readAt,
    ).not.toBeNull();
  });

  it('when the other program lets go, the next try serves again and the problem clears', async () => {
    const proxy = new HeldProxy();
    const d = await startDaemon({ config: { proxy: 'caddy' }, boot: { proxy, tailscale: new FakeTailscale() } });
    closers.push(d.close);
    expect(d.services!.routing.portProblem()).toEqual({ port: 443, heldBy: null });
    proxy.held = null;
    await d.services!.routing.sync({ force: true });
    expect(d.services!.routing.portProblem()).toBeNull();
  });
});
