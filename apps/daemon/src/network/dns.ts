// Use a local DNS server (US-SYS-06, D-105, D-106): hlabs keeps its names (`<host>.home.arpa` and `<host>.local`,
// and every app under them) pointing at this computer's LAN address in AdGuard Home installed by hlabs, a Pi-hole v6
// anywhere, or lists them for another DNS server. Only what hlabs wrote is ever removed.
import { hlabsError } from '@hlabs/api';
import { apps, auditLog, getSetting, setSetting, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { loopbackPort } from '../apps/ports';
import type { Logger } from '../logger';
import type { SecretStore } from '../platform/secrets';
import { homeDomains } from './domains';

export const PIHOLE_SECRET_REF = 'dns:pihole';
/** A sync that failed is tried again on the next change and at least this often. */
export const DNS_RETRY_MS = 10 * 60_000;
const TIMEOUT_MS = 5_000;
/** Pi-hole's API is down for a few seconds while its resolver restarts after a change: tries and the wait between. */
const PIHOLE_RETRIES = 4;
const PIHOLE_RETRY_MS = 3_000;

export type DnsKind = 'none' | 'adguard' | 'pihole' | 'manual';

/** The records to add by hand (US-SYS-06 "Another DNS server"): the names and every app, as A records. */
export function manualRecords(hostname: string, appHostnames: readonly string[], lan: string | null) {
  if (!lan) return [];
  return homeDomains(hostname)
    .slice()
    .reverse()
    .flatMap((domain) => [domain, ...appHostnames.map((a) => `${a}.${domain}`)])
    .map((name) => ({ name, type: 'A' as const, value: lan }));
}

/** AdGuard Home rewrites: each home domain and a wildcard for the apps under it. */
export function adguardRewrites(hostname: string, lan: string) {
  return homeDomains(hostname).flatMap((d) => [`${d} ${lan}`, `*.${d} ${lan}`]);
}

/** Pi-hole dnsmasq lines: `address=/<domain>/<ip>` covers the domain and everything under it. */
export function piholeLines(hostname: string, lan: string) {
  return homeDomains(hostname).map((d) => `address=/${d}/${lan}`);
}

class DnsError extends Error {
  constructor(readonly kind: 'unreachable' | 'auth') {
    super(kind);
  }
}

async function call(url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new DnsError('unreachable');
  }
  if (res.status === 401 || res.status === 403) throw new DnsError('auth');
  if (!res.ok) throw new DnsError('unreachable');
  return res;
}

/** AdGuard Home's API on its loopback port; it has no login of its own (the hlabs login protects its page). */
export const adguard = {
  async list(base: string): Promise<string[]> {
    const rows = (await (await call(`${base}/control/rewrite/list`)).json()) as Array<{
      domain: string;
      answer: string;
    }>;
    return rows.map((r) => `${r.domain} ${r.answer}`);
  },
  async add(base: string, entry: string) {
    const [domain, answer] = entry.split(' ');
    await call(`${base}/control/rewrite/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain, answer }),
    });
  },
  async remove(base: string, entry: string) {
    const [domain, answer] = entry.split(' ');
    await call(`${base}/control/rewrite/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain, answer }),
    });
  },
};

/**
 * Pi-hole v6: a session from the app password, then `misc.dnsmasq_lines` read and written as a whole with PATCH (its
 * one-line PUT/DELETE can't take a line with slashes, and `address=/name/ip` has them). Sessions are few, so each one
 * is ended after use.
 */
export const pihole = {
  base: (address: string) => address.replace(/\/+$/, ''),
  async session(address: string, password: string): Promise<string> {
    const res = await call(`${pihole.base(address)}/api/auth`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const sid = ((await res.json()) as { session?: { valid?: boolean; sid?: string } }).session;
    if (!sid?.valid || !sid.sid) throw new DnsError('auth');
    return sid.sid;
  },
  async end(address: string, sid: string) {
    await fetch(`${pihole.base(address)}/api/auth`, {
      method: 'DELETE',
      headers: { sid },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => undefined);
  },
  async lines(address: string, sid: string): Promise<string[]> {
    const res = await call(`${pihole.base(address)}/api/config/misc/dnsmasq_lines`, { headers: { sid } });
    const body = (await res.json()) as { config?: { misc?: { dnsmasq_lines?: string[] } } };
    return body.config?.misc?.dnsmasq_lines ?? [];
  },
  async setLines(address: string, sid: string, lines: string[]) {
    await call(`${pihole.base(address)}/api/config`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', sid },
      body: JSON.stringify({ config: { misc: { dnsmasq_lines: lines } } }),
    });
  },
  /** Logs in, trying again while Pi-hole's API is down for a restart after a change. */
  async login(address: string, password: string, retryMs = PIHOLE_RETRY_MS): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await pihole.session(address, password);
      } catch (err) {
        if (!(err instanceof DnsError) || err.kind !== 'unreachable' || attempt >= PIHOLE_RETRIES) throw err;
        await new Promise((r) => setTimeout(r, retryMs));
      }
    }
  },
  /** Logs in, swaps hlabs's old lines (`remove`) for `add`, keeps everyone else's, and logs out. */
  async update(
    address: string,
    password: string,
    remove: readonly string[],
    add: readonly string[],
    retryMs = PIHOLE_RETRY_MS,
  ) {
    const sid = await pihole.login(address, password, retryMs);
    try {
      const current = await pihole.lines(address, sid);
      const kept = current.filter((l) => !remove.includes(l));
      const next = [...kept, ...add.filter((l) => !kept.includes(l))];
      if (next.length !== current.length || next.some((l, i) => l !== current[i]))
        await pihole.setLines(address, sid, next);
    } finally {
      await pihole.end(address, sid);
    }
  },
  /** Checks the address and app password, ending the session it made. */
  async check(address: string, password: string, retryMs = PIHOLE_RETRY_MS) {
    await pihole.end(address, await pihole.login(address, password, retryMs));
  },
};

export interface DnsDeps {
  db: HlabsDb;
  secrets: SecretStore;
  logger: Logger;
  lanAddress: () => string | null;
  now?: () => number;
  /** The wait between Pi-hole log-in tries while it restarts (tests make it short). */
  piholeRetryMs?: number;
}

export class DnsService {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly deps: DnsDeps) {}

  private settings() {
    return getSetting(this.deps.db, 'network').dns;
  }

  private save(change: Partial<ReturnType<DnsService['settings']>>) {
    const network = getSetting(this.deps.db, 'network');
    setSetting(this.deps.db, 'network', { ...network, dns: { ...network.dns, ...change } });
  }

  /** AdGuard Home installed by hlabs and running: its API, else null. */
  adguardBase(): string | null {
    const row = this.deps.db.select().from(apps).where(eq(apps.id, 'adguard-home')).get();
    return row && row.state === 'running' && row.portFallback !== null
      ? `http://127.0.0.1:${loopbackPort(row.portFallback)}`
      : null;
  }

  adguardInstalled(): boolean {
    return this.deps.db.select({ id: apps.id }).from(apps).where(eq(apps.id, 'adguard-home')).get() !== undefined;
  }

  /** What the page shows: the choice, its address, the records (for "Another DNS server"), and any problem. */
  status() {
    const s = this.settings();
    const hostname = getSetting(this.deps.db, 'hostname');
    const appNames = this.deps.db
      .select({ hostname: apps.hostname })
      .from(apps)
      .all()
      .map((a) => a.hostname);
    return {
      kind: s.kind,
      address: s.address,
      adguardInstalled: this.adguardInstalled(),
      lastSyncAt: s.lastSyncAt,
      problem: s.problem,
      records: manualRecords(hostname, appNames, this.deps.lanAddress()),
    };
  }

  /**
   * Checks a Pi-hole's address and app password (US-SYS-06 "Test" answers at once). Saving waits out a restart after
   * an earlier change (`waitForRestart`).
   */
  async test(address: string, password: string, { waitForRestart = false } = {}) {
    try {
      if (waitForRestart) await pihole.check(address, password, this.deps.piholeRetryMs);
      else await pihole.end(address, await pihole.session(address, password));
    } catch (err) {
      throw hlabsError(
        err instanceof DnsError && err.kind === 'auth' ? 'DNS_SERVER_AUTH_FAILED' : 'DNS_SERVER_UNREACHABLE',
      );
    }
  }

  /** Writes what's wanted and removes what hlabs wrote before that isn't wanted any more. */
  private async apply(kind: DnsKind, address: string | null) {
    const hostname = getSetting(this.deps.db, 'hostname');
    const lan = this.deps.lanAddress();
    const owned = this.settings().owned;
    if (kind === 'adguard') {
      const base = this.adguardBase();
      if (!base) throw new DnsError('unreachable');
      const wanted = lan ? adguardRewrites(hostname, lan) : [];
      const present = new Set(await adguard.list(base));
      for (const entry of owned) if (!wanted.includes(entry) && present.has(entry)) await adguard.remove(base, entry);
      for (const entry of wanted) if (!present.has(entry)) await adguard.add(base, entry);
      return wanted;
    }
    if (kind === 'pihole' && address) {
      const password = await this.deps.secrets.get(PIHOLE_SECRET_REF);
      if (!password) throw new DnsError('auth');
      const wanted = lan ? piholeLines(hostname, lan) : [];
      await pihole.update(address, password, owned, wanted, this.deps.piholeRetryMs);
      return wanted;
    }
    return [];
  }

  /** Removes everything hlabs wrote in the server chosen now. */
  private async clear() {
    const s = this.settings();
    if (!s.owned.length) return;
    if (s.kind === 'adguard') {
      const base = this.adguardBase();
      if (base) for (const entry of s.owned) await adguard.remove(base, entry).catch(() => undefined);
    } else if (s.kind === 'pihole' && s.address) {
      const password = await this.deps.secrets.get(PIHOLE_SECRET_REF);
      if (password)
        await pihole.update(s.address, password, s.owned, [], this.deps.piholeRetryMs).catch(() => undefined);
    }
    this.save({ owned: [] });
  }

  /** Keeps the chosen server in step; a failure is recorded as a problem and tried again later. */
  sync(): Promise<void> {
    const next = this.queue.then(async () => {
      const s = this.settings();
      if (s.kind !== 'adguard' && s.kind !== 'pihole') return;
      try {
        const owned = await this.apply(s.kind, s.address);
        this.save({ owned, lastSyncAt: (this.deps.now ?? Date.now)(), problem: null });
      } catch (err) {
        this.save({ problem: err instanceof DnsError ? err.kind : 'unreachable' });
        this.deps.logger.warn({ err }, "couldn't update the local DNS server");
      }
    });
    this.queue = next;
    return next;
  }

  /** Choose a server (US-SYS-06): the previous one loses what hlabs wrote; the new one is written now. */
  async choose(
    input: { kind: DnsKind; address?: string; appPassword?: string },
    who: { userId: string; ip: string | null },
  ) {
    if (input.kind === 'adguard' && !this.adguardInstalled())
      throw hlabsError('VALIDATION_FAILED', 'AdGuard Home is not installed');
    if (input.kind === 'pihole') {
      if (!input.address) throw hlabsError('VALIDATION_FAILED', 'Pi-hole address needed', { address: true });
      const password = input.appPassword ?? (await this.deps.secrets.get(PIHOLE_SECRET_REF));
      if (!password) throw hlabsError('VALIDATION_FAILED', 'Pi-hole app password needed', { appPassword: true });
      await this.test(input.address, password, { waitForRestart: true });
      await this.deps.secrets.set(PIHOLE_SECRET_REF, password);
    }
    await this.queue;
    // The same server again keeps what hlabs wrote there: the sync below swaps it in one change.
    const before = this.settings();
    const same = before.kind === input.kind && (input.kind !== 'pihole' || before.address === input.address);
    if (!same)
      await this.clear().catch((err: unknown) => this.deps.logger.warn({ err }, "couldn't clear the old DNS records"));
    if (input.kind !== 'pihole') await this.deps.secrets.delete(PIHOLE_SECRET_REF).catch(() => undefined);
    this.save({
      kind: input.kind,
      address: input.kind === 'pihole' ? input.address! : null,
      owned: same ? before.owned : [],
      problem: null,
      lastSyncAt: null,
    });
    this.deps.db
      .insert(auditLog)
      .values({
        id: ulid(),
        at: Date.now(),
        userId: who.userId,
        action: 'network.setDnsServer',
        target: input.kind,
        detailJson: { address: input.address ?? null },
        ip: who.ip,
      })
      .run();
    await this.sync();
  }
}
