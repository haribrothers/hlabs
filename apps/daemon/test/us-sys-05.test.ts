// US-SYS-05 · See and change web ports (server side).
import { apps, appSources, auditLog, catalogApps, getSetting, users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';
import { FakeSystemProbe } from './fakes/system';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

/** A daemon where another program holds port 9443. */
const setup = () => daemonWithAdmin(closers, {}, { system: new FakeSystemProbe(undefined, new Set([9443])) });

describe('US-SYS-05', () => {
  it('network.ports lists the web ports and the raw ports apps publish', async () => {
    const d = await setup();
    const { db } = d.services!;
    db.insert(appSources)
      .values({ id: 'builtin', kind: 'builtin', name: 'hlabs', url: 'builtin:' })
      .onConflictDoNothing()
      .run();
    db.insert(catalogApps)
      .values({
        sourceId: 'builtin',
        appId: 'adguard-home',
        version: '1',
        manifestJson: {
          name: 'AdGuard Home',
          ports: [{ service: 'adguard', container: 53, protocol: 'udp', host: 53, label: 'DNS' }],
        },
        updatedAt: 1,
        firstSeenAt: 1,
      })
      .run();
    db.insert(apps)
      .values({
        id: 'adguard-home',
        sourceId: 'builtin',
        version: '1',
        state: 'running',
        hostname: 'adguard-home',
        installedAt: 1,
        updatedAt: 1,
      })
      .run();
    expect((await d.query('network.ports')).result!.data).toEqual({
      ...getSetting(db, 'network').ports,
      appPorts: [{ appId: 'adguard-home', appName: 'AdGuard Home', port: 53, protocol: 'udp', label: 'DNS' }],
    });
  });

  it('saves free ports, audits the change and moves the proxy to them', async () => {
    const d = await setup();
    const { db, routing } = d.services!;
    expect((await d.mutate('network.setPorts', { https: 8443, http: 8080 })).result?.data).toEqual({ ok: true });
    expect(getSetting(db, 'network').ports).toEqual({ https: 8443, http: 8080 });
    expect(routing.state().ports).toEqual({ https: 8443, http: 8080 });
    expect(db.select().from(auditLog).where(eq(auditLog.action, 'network.setPorts')).get()).toBeDefined();
    // Back to the usual ones.
    expect((await d.mutate('network.setPorts', { https: 443, http: 80 })).result?.data).toEqual({ ok: true });
  });

  it('a port another program holds is NETWORK_PORT_IN_USE, naming it; a bad port is VALIDATION_FAILED', async () => {
    const d = await setup();
    const res = await d.mutate('network.setPorts', { https: 9443, http: 8080 });
    expect(res.error?.data).toMatchObject({ hlabsCode: 'NETWORK_PORT_IN_USE', detail: { port: 9443 } });
    for (const bad of [
      { https: 500, http: 80 },
      { https: 12001, http: 80 },
      { https: 8443, http: 8443 },
    ])
      expect((await d.mutate('network.setPorts', bad)).error?.data.hlabsCode).toBe('VALIDATION_FAILED');
  });

  it('members get ACCESS_DENIED', async () => {
    const d = await setup();
    d.services!.db.update(users).set({ role: 'member' }).where(eq(users.id, d.userId)).run();
    expect((await d.mutate('network.setPorts', { https: 8443, http: 8080 })).error?.data.hlabsCode).toBe(
      'ACCESS_DENIED',
    );
  });
});
