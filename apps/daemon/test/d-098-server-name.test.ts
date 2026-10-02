// D-098 · The name on the network, chosen on setup's system step: saved with Continue (before anything is published
// under it), Caddy and mDNS follow it, and the system check reports it.
import { apps, getSetting } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeSystemProbe } from './fakes/system';
import { startDaemon } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string } } };

async function atSystemStep() {
  const printed: string[] = [];
  const daemon = await startDaemon({ boot: { print: (line) => printed.push(line), system: new FakeSystemProbe() } });
  closers.push(daemon.close);
  const token = new URL(printed.join('').match(/open (\S+)/)![1]!).searchParams.get('token')!;
  const headers = { 'content-type': 'application/json', 'x-hlabs-setup': token };
  const call = async (path: string, input?: unknown) =>
    (await (
      await fetch(`${daemon.url}/trpc/onboarding.${path}`, {
        method: input === undefined ? 'GET' : 'POST',
        headers,
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      })
    ).json()) as Reply;
  await call('setStep', { step: 'system' });
  return { ...daemon, call };
}

describe('D-098', () => {
  it('the system check reports the name; Continue saves a new one', async () => {
    const d = await atSystemStep();
    expect((await d.call('checkSystem')).result?.data.hostname).toBe('hlabs');
    expect((await d.call('confirmSystem', { startAtLogin: true, hostname: 'homebox' })).result?.data).toEqual({
      ok: true,
    });
    const db = d.services!.db;
    expect(getSetting(db, 'hostname')).toBe('homebox');
  });

  it('without a name, Continue keeps the current one', async () => {
    const d = await atSystemStep();
    await d.call('confirmSystem', { startAtLogin: true });
    expect(getSetting(d.services!.db, 'hostname')).toBe('hlabs');
  });

  it('refuses a name that is not lowercase letters, numbers and dashes, or ends with a dash', async () => {
    const d = await atSystemStep();
    for (const hostname of ['Home Box', '-home', 'home-', 'a'.repeat(41), '']) {
      expect((await d.call('confirmSystem', { startAtLogin: true, hostname })).error?.data.hlabsCode).toBe(
        'VALIDATION_FAILED',
      );
    }
    expect(getSetting(d.services!.db, 'hostname')).toBe('hlabs');
  });

  it("refuses a name an installed app's address already uses", async () => {
    const d = await atSystemStep();
    d.services!.db.insert(apps)
      .values({ id: 'jellyfin', version: '1', state: 'running', hostname: 'jellyfin', installedAt: 1, updatedAt: 1 })
      .run();
    expect((await d.call('confirmSystem', { startAtLogin: true, hostname: 'jellyfin' })).error?.data.hlabsCode).toBe(
      'HOSTNAME_TAKEN',
    );
  });
});

describe('D-098 · ports held by hlabs itself', () => {
  it("the system check doesn't count the ports hlabs's own proxy holds as in use", async () => {
    const { runSystemCheck } = await import('../src/onboarding/system-check');
    const engine = {
      check: async () => ({ state: 'running', candidate: { kind: 'orbstack' }, info: { version: '1' } }),
    } as never;
    const probe = new FakeSystemProbe(142e9, new Set([80, 443]));
    const base = { engine, probe, storageRoot: '/tmp', headless: false };
    // Another program on 80 and 443: hlabs moves to 8080 and 8443.
    expect((await runSystemCheck(base)).ports).toMatchObject({ http: { use: 8080 }, https: { use: 8443 } });
    // hlabs's own Caddy on them (setup run again): they stay.
    const own = await runSystemCheck({ ...base, ownPorts: () => [80, 443] });
    expect(own.ports).toEqual({
      http: { port: 80, inUse: false, use: 80 },
      https: { port: 443, inUse: false, use: 443 },
      level: 'ok',
    });
  });
});

describe('D-098 · the dashboard addresses follow the name', () => {
  it('session mutations are accepted from the new name, its ports, and the tailnet address', async () => {
    const { dashboardOrigins } = await import('../src/http/dashboard-origins');
    const { setSetting } = await import('@hlabs/db');
    const d = await atSystemStep();
    const db = d.services!.db;
    expect(dashboardOrigins('https://hlabs.local', db)).toEqual([
      'https://hlabs.local',
      'https://hlabs.home.arpa',
      'http://hlabs.local',
    ]);
    await d.call('confirmSystem', { startAtLogin: true, hostname: 'harilabs' });
    setSetting(db, 'network', { ...getSetting(db, 'network'), ports: { https: 8443, http: 8080 } });
    expect(dashboardOrigins('https://hlabs.local', db)).toEqual([
      'https://hlabs.local',
      'https://harilabs.local:8443',
      'https://harilabs.home.arpa:8443',
      'http://harilabs.local:8080',
    ]);
    // After setup, not over plain HTTP; with remote access, the tailnet address too.
    setSetting(db, 'onboarding', { ...getSetting(db, 'onboarding'), completedAt: Date.now() });
    setSetting(db, 'remote', { ...getSetting(db, 'remote'), tailnetName: 'tail1234.ts.net' });
    expect(dashboardOrigins('http://127.0.0.1:7474', db)).toEqual([
      'http://127.0.0.1:7474',
      'https://harilabs.local:8443',
      'https://harilabs.home.arpa:8443',
      'https://harilabs.tail1234.ts.net',
    ]);
  });

  it('a signed-in mutation from the new name gets through (the QR code step after a rename)', async () => {
    const { daemonWithAdmin } = await import('./admin-session');
    const closers2: Array<() => Promise<void>> = [];
    try {
      const d = await daemonWithAdmin(closers2, { dashboardUrl: 'https://hlabs.local' });
      const { setSetting } = await import('@hlabs/db');
      setSetting(d.services!.db, 'hostname', 'harilabs');
      const res = await fetch(`${d.url}/trpc/onboarding.setupTotp?batch=1`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: d.cookie,
          'x-hlabs-csrf': d.csrf,
          'x-hlabs-setup': d.token,
          origin: 'https://harilabs.local',
        },
        body: '{}',
      });
      expect(res.status).toBe(200);
      // And another site is still refused.
      const other = await fetch(`${d.url}/trpc/onboarding.setupTotp?batch=1`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: d.cookie,
          'x-hlabs-csrf': d.csrf,
          'x-hlabs-setup': d.token,
          origin: 'https://evil.example',
        },
        body: '{}',
      });
      expect(other.status).toBe(403);
    } finally {
      for (const close of closers2) await close();
    }
  });
});
