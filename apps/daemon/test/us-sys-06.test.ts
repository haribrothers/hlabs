// US-SYS-06 · Use a local DNS server (server side): AdGuard Home through its API, a Pi-hole v6 anywhere, or records to
// add by hand; only what hlabs wrote is removed (D-106). Small stand-ins answer as AdGuard Home and Pi-hole do.
import { apps, auditLog, getSetting, setSetting, users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { DnsService, manualRecords, PIHOLE_SECRET_REF } from '../src/network/dns';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const LAN = '192.168.1.20';

async function listen(server: Server): Promise<number> {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  closers.push(() => new Promise((r) => server.close(() => r())));
  return (server.address() as AddressInfo).port;
}

const body = (req: IncomingMessage) =>
  new Promise<string>((r) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => r(b));
  });

/** AdGuard Home's rewrite API, with one rewrite of the person's own. */
function fakeAdguard() {
  const rewrites = [{ domain: 'nas.lan', answer: '192.168.1.5' }];
  const server = createServer(async (req, res) => {
    if (req.url === '/control/rewrite/list') return res.end(JSON.stringify(rewrites));
    const r = JSON.parse((await body(req)) || '{}') as { domain: string; answer: string };
    if (req.url === '/control/rewrite/add') rewrites.push(r);
    if (req.url === '/control/rewrite/delete') {
      const i = rewrites.findIndex((x) => x.domain === r.domain && x.answer === r.answer);
      if (i >= 0) rewrites.splice(i, 1);
    }
    res.end();
  });
  return { server, rewrites };
}

/**
 * Pi-hole v6 as it answers: a session for the right app password (ended with DELETE /api/auth), `misc.dnsmasq_lines`
 * read with GET and written whole with PATCH /api/config, 404 for a one-line PUT whose line has slashes, and no answer
 * for a moment after each change while its resolver restarts.
 */
function fakePihole() {
  let lines = ['address=/printer.lan/192.168.1.9'];
  const sessions = new Set<string>();
  let next = 0;
  let restartingUntil = 0;
  let changes = 0;
  const server = createServer(async (req, res) => {
    if (Date.now() < restartingUntil) return req.socket.destroy();
    if (req.url === '/api/auth' && req.method === 'POST') {
      const ok = (JSON.parse(await body(req)) as { password: string }).password === 'app-pass';
      const sid = `s${++next}`;
      if (ok) sessions.add(sid);
      return res.end(JSON.stringify({ session: ok ? { valid: true, sid } : { valid: false } }));
    }
    const sid = String(req.headers.sid ?? '');
    if (!sessions.has(sid)) return res.writeHead(401).end();
    if (req.url === '/api/auth' && req.method === 'DELETE') {
      sessions.delete(sid);
      return res.writeHead(204).end();
    }
    if (req.url === '/api/config/misc/dnsmasq_lines' && req.method === 'GET')
      return res.end(JSON.stringify({ config: { misc: { dnsmasq_lines: lines } } }));
    if (req.url === '/api/config' && req.method === 'PATCH') {
      lines = (JSON.parse(await body(req)) as { config: { misc: { dnsmasq_lines: string[] } } }).config.misc
        .dnsmasq_lines;
      changes++;
      // Its sessions live in the resolver's memory: a restart ends them.
      sessions.clear();
      restartingUntil = Date.now() + 100;
      return res.end('{}');
    }
    res.writeHead(404).end();
  });
  return { server, lines: () => lines, sessions, changes: () => changes };
}

async function setup() {
  const d = await daemonWithAdmin(closers);
  const { db, secrets, logger } = d.services!;
  const dns = new DnsService({ db, secrets, logger, lanAddress: () => LAN, piholeRetryMs: 50 });
  const who = { userId: d.userId, ip: null };
  return { d, db, secrets, dns, who };
}

describe('US-SYS-06', () => {
  it('AdGuard Home: one rewrite per name plus a wildcard for the apps; switching away removes only those', async () => {
    const { db, dns, who } = await setup();
    const ag = fakeAdguard();
    const port = await listen(ag.server);
    // Its API is on the app's loopback port (its own port + 1000).
    db.insert(apps)
      .values({
        id: 'adguard-home',
        version: '1',
        state: 'running',
        hostname: 'adguard-home',
        portFallback: port - 1000,
        installedAt: 1,
        updatedAt: 1,
      })
      .run();
    await dns.choose({ kind: 'adguard' }, who);
    expect(ag.rewrites).toEqual([
      { domain: 'nas.lan', answer: '192.168.1.5' },
      { domain: 'hlabs.local', answer: LAN },
      { domain: '*.hlabs.local', answer: LAN },
      { domain: 'hlabs.home.arpa', answer: LAN },
      { domain: '*.hlabs.home.arpa', answer: LAN },
    ]);
    expect(getSetting(db, 'network').dns).toMatchObject({ kind: 'adguard', problem: null });
    expect(db.select().from(auditLog).where(eq(auditLog.action, 'network.setDnsServer')).get()).toBeDefined();

    await dns.choose({ kind: 'none' }, who);
    expect(ag.rewrites).toEqual([{ domain: 'nas.lan', answer: '192.168.1.5' }]);
  });

  it('AdGuard Home not installed: refused', async () => {
    const { dns, who } = await setup();
    await expect(dns.choose({ kind: 'adguard' }, who)).rejects.toMatchObject({
      cause: { hlabsCode: 'VALIDATION_FAILED' },
    });
  });

  it('Pi-hole: the app password is checked, kept in the secret store, and two dnsmasq lines written; switching away removes them', async () => {
    const { db, secrets, dns, who } = await setup();
    const ph = fakePihole();
    const address = `http://127.0.0.1:${await listen(ph.server)}`;
    await expect(dns.test(address, 'wrong')).rejects.toMatchObject({ cause: { hlabsCode: 'DNS_SERVER_AUTH_FAILED' } });
    await dns.choose({ kind: 'pihole', address, appPassword: 'app-pass' }, who);
    expect([...ph.lines()].sort()).toEqual([
      `address=/hlabs.home.arpa/${LAN}`,
      `address=/hlabs.local/${LAN}`,
      'address=/printer.lan/192.168.1.9',
    ]);
    expect(await secrets.get(PIHOLE_SECRET_REF)).toBe('app-pass');
    expect(JSON.stringify(getSetting(db, 'network'))).not.toContain('app-pass');

    await dns.choose({ kind: 'manual' }, who);
    expect(ph.lines()).toEqual(['address=/printer.lan/192.168.1.9']);
    // Every session hlabs opened was ended (Pi-hole has few).
    expect(ph.sessions.size).toBe(0);
    expect(await secrets.get(PIHOLE_SECRET_REF)).toBeNull();
  });

  it('saving the same Pi-hole again keeps its records and changes them at most once, through its restart', async () => {
    const { dns, who } = await setup();
    const ph = fakePihole();
    const address = `http://127.0.0.1:${await listen(ph.server)}`;
    await dns.choose({ kind: 'pihole', address, appPassword: 'app-pass' }, who);
    expect(ph.changes()).toBe(1);
    // Straight away, while it restarts.
    await dns.choose({ kind: 'pihole', address }, who);
    expect(ph.changes()).toBe(1);
    expect(ph.lines()).toContain(`address=/hlabs.home.arpa/${LAN}`);
    expect(dns.status().problem).toBeNull();
    expect(ph.sessions.size).toBe(0);
  });

  it("a server that doesn't answer is a problem, tried again on the next sync", async () => {
    const { db, dns, who } = await setup();
    const ph = fakePihole();
    const port = await listen(ph.server);
    await dns.choose({ kind: 'pihole', address: `http://127.0.0.1:${port}`, appPassword: 'app-pass' }, who);
    ph.server.close();
    ph.server.closeAllConnections();
    // A new app means a new sync; the server is gone.
    const s = getSetting(db, 'network');
    setSetting(db, 'network', { ...s, dns: { ...s.dns, owned: [] } });
    await dns.sync();
    expect(getSetting(db, 'network').dns.problem).toBe('unreachable');
  });

  it('another DNS server: the records to add by hand, every app included', () => {
    expect(manualRecords('hlabs', ['immich'], LAN)).toEqual([
      { name: 'hlabs.home.arpa', type: 'A', value: LAN },
      { name: 'immich.hlabs.home.arpa', type: 'A', value: LAN },
      { name: 'hlabs.local', type: 'A', value: LAN },
      { name: 'immich.hlabs.local', type: 'A', value: LAN },
    ]);
    expect(manualRecords('hlabs', [], null)).toEqual([]);
  });

  it('network.status includes the DNS server; members get ACCESS_DENIED for changing it', async () => {
    const { d } = await setup();
    expect((await d.query('network.status')).result!.data.dns).toMatchObject({ kind: 'none', adguardInstalled: false });
    expect((await d.mutate('network.setDnsServer', { kind: 'manual' })).result?.data).toEqual({ ok: true });
    d.services!.db.update(users).set({ role: 'member' }).where(eq(users.id, d.userId)).run();
    expect((await d.mutate('network.setDnsServer', { kind: 'none' })).error?.data.hlabsCode).toBe('ACCESS_DENIED');
  });
});
