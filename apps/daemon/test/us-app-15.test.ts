// US-APP-15 · Change web address and port: the address is lowercase letters, numbers and dashes, not another app's
// and not `hlabs`; the port is 12000–12999 and free (APP_PORT_IN_USE when taken). Saved, the app moves: Caddy serves
// the new address and port and no longer the old ones, mDNS publishes the new name, and the tailnet address is the
// new port + 2000 (D-012, D-110).
import { apps, setSetting } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { parse } from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import type { NoopProxyManager } from '../src/caddy/index';
import type { NoopMdnsPublisher } from '../src/mdns/index';
import { settingsApp } from './config-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function withAnotherApp() {
  const t = await settingsApp(closers);
  const res = await t.d.mutate('apps.install', { appId: 'uptime-kuma' });
  await t.s.jobs.settled(res.result!.data.jobId as string);
  const other = t.s.db.select().from(apps).where(eq(apps.id, 'uptime-kuma')).get()!;
  return { ...t, other };
}

describe('US-APP-15', () => {
  it('getConfig gives the address, the port, the container port and what is taken', async () => {
    const t = await withAnotherApp();
    const config = (await t.config()) as {
      address: { hostname: string; domain: string; taken: string[] };
      port: { hostPort: number; containerPort: number; taken: number[]; tailnetHost: string | null };
    };
    expect(config.address).toMatchObject({ hostname: 'vaultwarden', domain: 'hlabs.local' });
    expect(config.address.taken).toEqual(expect.arrayContaining(['hlabs', 'uptime-kuma']));
    expect(config.address.taken).not.toContain('vaultwarden');
    expect(config.port).toEqual({
      hostPort: t.row().portFallback,
      containerPort: 80,
      taken: [t.other.portFallback],
      tailnetHost: null,
    });
  });

  it.each([
    ['Has Capitals', 'BAD_REQUEST'],
    ['a'.repeat(41), 'BAD_REQUEST'],
    ['under_score', 'BAD_REQUEST'],
  ])('the address "%s" is refused', async (hostname) => {
    const t = await settingsApp(closers);
    const { reply } = await t.save('apps.setConfig', { hostname });
    expect(reply.error?.data.hlabsCode).toBe('VALIDATION_FAILED');
    expect(t.row().hostname).toBe('vaultwarden');
  });

  it("`hlabs` and another app's address are taken", async () => {
    const t = await withAnotherApp();
    for (const hostname of ['hlabs', 'uptime-kuma']) {
      const { reply } = await t.save('apps.setConfig', { hostname });
      expect(reply.error?.data).toMatchObject({ hlabsCode: 'HOSTNAME_TAKEN', detail: { hostname } });
    }
    expect(t.row().hostname).toBe('vaultwarden');
  });

  it('a port outside 12000–12999 is refused', async () => {
    const t = await settingsApp(closers);
    for (const hostPort of [8080, 13000, 11999]) {
      const { reply } = await t.save('apps.setConfig', { hostPort });
      expect(reply.error?.data).toMatchObject({ hlabsCode: 'VALIDATION_FAILED', detail: { port: hostPort } });
    }
  });

  it("another app's port, or one something else holds, is APP_PORT_IN_USE", async () => {
    const t = await withAnotherApp();
    const taken = await t.save('apps.setConfig', { hostPort: t.other.portFallback });
    expect(taken.reply.error?.data).toMatchObject({
      hlabsCode: 'APP_PORT_IN_USE',
      detail: { port: t.other.portFallback, app: 'Vaultwarden' },
    });
    // Something else listens on its loopback port (D-086).
    t.busy.add(12500 + 1000);
    const held = await t.save('apps.setConfig', { hostPort: 12500 });
    expect(held.reply.error?.data).toMatchObject({ hlabsCode: 'APP_PORT_IN_USE', detail: { port: 12500 } });
    expect(t.row().portFallback).not.toBe(12500);
  });

  it('saved, the app moves: the new address and port are served, the old ones no longer', async () => {
    const t = await settingsApp(closers);
    const oldPort = t.row().portFallback!;
    const { job } = await t.save('apps.setConfig', { hostname: 'passwords', hostPort: 12345 });
    expect(job?.state).toBe('succeeded');
    expect(t.row()).toMatchObject({ hostname: 'passwords', portFallback: 12345, state: 'running' });
    const proxy = (t.s.proxy as NoopProxyManager).last!;
    const route = proxy.apps.find((a) => a.appId === 'vaultwarden')!;
    expect(route).toMatchObject({ hostname: 'passwords', port: 12345 });
    expect(proxy.apps.some((a) => a.hostname === 'vaultwarden' || a.port === oldPort)).toBe(false);
    const names = (t.s.mdns as NoopMdnsPublisher).names;
    expect(names).toContain('passwords.hlabs.local');
    expect(names).not.toContain('vaultwarden.hlabs.local');
    // Its web service is published on the new loopback port, and the app is told its new address.
    const compose = parse(t.file('docker-compose.yml')) as { services: { vaultwarden: { ports: string[] } } };
    expect(compose.services.vaultwarden.ports).toEqual(['127.0.0.1:13345:80']);
    expect(t.file('.env')).toContain("HLABS_URL='https://passwords.hlabs.local'");
    expect(t.audits('app.setConfig')[0]!.detailJson).toEqual({
      keys: [],
      hostname: { from: 'vaultwarden', to: 'passwords' },
      port: { from: oldPort, to: 12345 },
    });
  });

  it('on the tailnet it is the new port + 2000', async () => {
    const t = await settingsApp(closers);
    setSetting(t.s.db, 'remote', { tailnetName: 'tail1234.ts.net' } as never);
    await t.save('apps.setConfig', { hostPort: 12345 });
    const urls = (await t.q('apps.get', { appId: 'vaultwarden' })).result!.data.urls;
    expect(urls).toMatchObject({ tailnet: 'https://hlabs.tail1234.ts.net:14345', port: 12345 });
    expect(t.file('.env')).toContain("HLABS_TAILNET_URL='https://hlabs.tail1234.ts.net:14345'");
    expect(((await t.config()) as { port: { tailnetHost: string } }).port.tailnetHost).toBe('hlabs.tail1234.ts.net');
  });
});
