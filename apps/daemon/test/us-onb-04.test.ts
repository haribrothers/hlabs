// US-ONB-04 · Run the system check.
import { getSetting } from '@hlabs/db';
import { createServer, type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { macosVersion, NodeSystemProbe, parseOsRelease } from '../src/platform/system';
import { FakeSystemProbe } from './fakes/system';
import { startDaemon } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string } } };

async function start(opts: { probe?: FakeSystemProbe; noEngine?: boolean } = {}) {
  const printed: string[] = [];
  const daemon = await startDaemon({
    boot: {
      print: (line) => printed.push(line),
      system: opts.probe ?? new FakeSystemProbe(),
      ...(opts.noEngine ? { engine: { candidates: async () => [], retryMs: 60_000 } } : {}),
    },
  });
  closers.push(daemon.close);
  const token = new URL(printed.join('').match(/open (\S+)/)![1]!).searchParams.get('token')!;
  const headers = { 'content-type': 'application/json', 'x-hlabs-setup': token };
  const check = async () =>
    (await (await fetch(`${daemon.url}/trpc/onboarding.checkSystem`, { headers })).json()) as Reply;
  const mutate = async (path: string, input: unknown) =>
    (await (
      await fetch(`${daemon.url}/trpc/onboarding.${path}`, { method: 'POST', headers, body: JSON.stringify(input) })
    ).json()) as Reply;
  return { ...daemon, check, mutate };
}

describe('US-ONB-04', () => {
  it('reports CPU, OS, container runtime, free disk space and ports', async () => {
    const { check } = await start();
    expect((await check()).result?.data).toEqual({
      cpu: { model: 'Apple M2', arch: 'arm64' },
      os: { platform: 'darwin', name: 'macOS', version: '15', headless: false },
      engine: { kind: 'orbstack', version: '27.0.0-fake', state: 'running', level: 'ok', install: null },
      disk: { freeBytes: 142e9, path: expect.any(String), level: 'ok' },
      ports: {
        http: { port: 80, inUse: false, use: 80 },
        https: { port: 443, inUse: false, use: 443 },
        level: 'ok',
      },
      canContinue: true,
    });
  });

  it('needs the setup token', async () => {
    const { url } = await start();
    const res = (await (await fetch(`${url}/trpc/onboarding.checkSystem`)).json()) as Reply;
    expect(res.error?.data.hlabsCode).toBe('ONBOARDING_SETUP_TOKEN_REQUIRED');
  });

  it('blocks below 10 GB free and warns below 30 GB', async () => {
    const low = await start({ probe: new FakeSystemProbe(5e9) });
    expect((await low.check()).result?.data).toMatchObject({ disk: { level: 'error' }, canContinue: false });
    const tight = await start({ probe: new FakeSystemProbe(20e9) });
    expect((await tight.check()).result?.data).toMatchObject({ disk: { level: 'warning' }, canContinue: true });
  });

  it('warns about a taken port and picks the fallback, without blocking', async () => {
    const one = await start({ probe: new FakeSystemProbe(142e9, new Set([443])) });
    expect((await one.check()).result?.data).toMatchObject({
      ports: { https: { inUse: true, use: 8443 }, http: { inUse: false, use: 80 }, level: 'warning' },
      canContinue: true,
    });
    const both = await start({ probe: new FakeSystemProbe(142e9, new Set([80, 443])) });
    expect((await both.check()).result?.data.ports).toMatchObject({ http: { use: 8080 }, https: { use: 8443 } });
  });

  it('blocks when no container runtime is found', async () => {
    const { check } = await start({ noEngine: true });
    expect((await check()).result?.data).toMatchObject({
      engine: { kind: null, version: null, state: 'missing', level: 'error' },
      canContinue: false,
    });
  });

  it('Continue saves start at login, the ports for Caddy and step account', async () => {
    const { mutate, services } = await start({ probe: new FakeSystemProbe(142e9, new Set([443])) });
    expect((await mutate('confirmSystem', { startAtLogin: false })).error?.data.hlabsCode).toBe(
      'ONBOARDING_STEP_INVALID',
    );
    await mutate('setStep', { step: 'system' });
    expect((await mutate('confirmSystem', { startAtLogin: false })).result?.data).toEqual({ ok: true });
    const db = services!.db;
    expect(getSetting(db, 'onboarding').step).toBe('account');
    expect(getSetting(db, 'startup').startAtLogin).toBe(false);
    expect(getSetting(db, 'network').ports).toEqual({ http: 80, https: 8443 });
  });

  it('Continue keeps a later saved step (after Back)', async () => {
    const { url, mutate, services } = await start();
    await fetch(`${url}/dev/reset-onboarding`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ step: 'storage' }),
    });
    expect((await mutate('confirmSystem', { startAtLogin: true })).result?.data).toEqual({ ok: true });
    expect(getSetting(services!.db, 'onboarding').step).toBe('storage');
  });

  it('Continue refuses when a blocking check fails', async () => {
    const noEngine = await start({ noEngine: true });
    await noEngine.mutate('setStep', { step: 'system' });
    expect((await noEngine.mutate('confirmSystem', { startAtLogin: true })).error?.data.hlabsCode).toBe(
      'ENGINE_UNAVAILABLE',
    );
    const full = await start({ probe: new FakeSystemProbe(1e9) });
    await full.mutate('setStep', { step: 'system' });
    expect((await full.mutate('confirmSystem', { startAtLogin: true })).error?.data.hlabsCode).toBe('DISK_FULL');
    expect(getSetting(full.services!.db, 'onboarding').step).toBe('system');
  });
});

describe('US-ONB-04 system probe', () => {
  it('names the macOS version from the Darwin release', () => {
    expect(macosVersion('24.1.0')).toBe('15');
    expect(macosVersion('23.6.0')).toBe('14');
    expect(macosVersion('25.0.0')).toBe('26');
  });

  it('reads the distro and version from os-release', () => {
    expect(parseOsRelease('NAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\n')).toEqual({
      name: 'Ubuntu',
      version: '24.04',
    });
    expect(parseOsRelease('')).toEqual({ name: 'Linux', version: '' });
  });

  it('sees a port another process is listening on', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen({ port: 0, host: '0.0.0.0' }, resolve));
    const { port } = server.address() as AddressInfo;
    const probe = new NodeSystemProbe();
    expect(await probe.portInUse(port)).toBe(true);
    await new Promise((resolve) => server.close(resolve));
    expect(await probe.portInUse(port)).toBe(false);
  });

  it('measures free space from the nearest existing folder', async () => {
    expect(await new NodeSystemProbe().freeBytes('/tmp/hlabs-does-not-exist/storage')).toBeGreaterThan(0);
  });
});
