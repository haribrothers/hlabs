// US-ONB-05 · Install Colima automatically when no engine is found (macOS).
import { hlabsCodeOf } from '@hlabs/api';
import { getSetting } from '@hlabs/db';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { colimaResources, colimaSocket, installColima } from '../src/engine/colima-installer';
import { ENGINE_DOWNLOADS } from '../src/engine/downloads';
import type { EngineCandidate } from '../src/engine/types';
import { FakeEngine, fakeMachine } from './fakes/engine';
import { FakeInstallerHost } from './fakes/installer';
import { FakeSystemProbe } from './fakes/system';
import { startDaemon, tempDir } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string } } };

async function start(opts: { io?: FakeInstallerHost; probe?: FakeSystemProbe; engineAlready?: boolean } = {}) {
  const home = tempDir('hlabs-home-');
  const socket = colimaSocket(home);
  const available: EngineCandidate[] = [];
  const io = opts.io ?? new FakeInstallerHost();
  io.onStarted = () => void available.push({ kind: 'colima', socketPath: socket, managedByHlabs: true });
  const printed: string[] = [];
  const daemon = await startDaemon({
    boot: {
      print: (line) => printed.push(line),
      system: opts.probe ?? new FakeSystemProbe(),
      installer: io,
      home,
      engine: {
        candidates: async () =>
          opts.engineAlready ? [{ kind: 'orbstack', socketPath: '/orb.sock', managedByHlabs: false }] : available,
        detect: fakeMachine({
          [socket]: new FakeEngine(true, { version: '28.1.1', cpus: 4, memoryBytes: 8e9 }),
          '/orb.sock': new FakeEngine(),
        }),
        retryMs: 60_000,
      },
    },
  });
  closers.push(daemon.close);
  const token = new URL(printed.join('').match(/open (\S+)/)![1]!).searchParams.get('token')!;
  const headers = { 'content-type': 'application/json', 'x-hlabs-setup': token };
  // A void input goes batched, the way the dashboard's client sends it.
  const install = async () =>
    (
      (await (
        await fetch(`${daemon.url}/trpc/onboarding.installEngine?batch=1`, { method: 'POST', headers, body: '{}' })
      ).json()) as Reply[]
    )[0]!;
  const check = async (includeLog = false) =>
    (await (
      await fetch(
        `${daemon.url}/trpc/onboarding.checkSystem?input=${encodeURIComponent(JSON.stringify({ includeLog }))}`,
        { headers },
      )
    ).json()) as Reply;
  return { ...daemon, io, home, install, check };
}

describe('US-ONB-05', () => {
  it('installs Colima on a Mac with no engine, and the check then passes with Colima', async () => {
    const { install, check, services, io, config } = await start();
    expect((await check()).result?.data).toMatchObject({ engine: { state: 'missing', install: null } });

    const jobId = (await install()).result?.data.jobId as string;
    const job = await services!.jobs.settled(jobId);
    expect(job).toMatchObject({ kind: 'engine_install', state: 'succeeded', progress: 100 });

    expect(io.downloads).toEqual(ENGINE_DOWNLOADS.arm64.map((a) => a.url));
    expect(io.runs[0]!.command).toBe(join(config.paths.dataDir, 'engine', 'bin', 'colima'));
    expect(io.runs[0]!.args.join(' ')).toBe(
      'start --profile hlabs --cpu 4 --memory 8 --disk 100 --vm-type vz --mount-type virtiofs --runtime docker',
    );
    // hlabs's own tools first, and a separate docker config so the user's docker context isn't switched.
    const engine = join(config.paths.dataDir, 'engine');
    expect(io.runs[0]!.env.PATH?.startsWith(`${join(engine, 'bin')}:`)).toBe(true);
    expect(io.runs[0]!.env.DOCKER_CONFIG).toBe(join(engine, 'docker-config'));

    expect((await check()).result?.data).toMatchObject({
      engine: {
        kind: 'colima',
        version: '28.1.1',
        state: 'running',
        level: 'ok',
        install: { jobId, state: 'succeeded', progress: 100, lastLogLine: 'Colima is running', hlabsCode: null },
      },
      canContinue: true,
    });
    // D-058: the preference stays auto; D-057: the download is recorded.
    expect(getSetting(services!.db, 'engine').preferred).toBe('auto');
    expect(getSetting(services!.db, 'connections').engineDownload?.lastContactAt).toBeGreaterThan(0);
    const log = readFileSync(join(config.paths.dataDir, 'engine', 'install.log'), 'utf8');
    expect(log).toContain('Downloading colima 0.10.3');
    expect(((await check(true)).result?.data.engine as { install: { log: string } }).install.log).toBe(log);
  });

  it('a reload mid-install sees the same job; no second install starts', async () => {
    const io = new FakeInstallerHost();
    let release!: () => void;
    io.hold = new Promise((r) => (release = r));
    const { install, check, services } = await start({ io });
    const first = (await install()).result?.data.jobId as string;
    await new Promise((r) => setTimeout(r, 20));
    expect((await install()).result?.data.jobId).toBe(first);
    const during = (await check()).result?.data.engine as { install: { state: string; progress: number } };
    expect(during.install).toMatchObject({ state: 'running' });
    expect(during.install.progress).toBeGreaterThanOrEqual(50);
    expect(during.install.progress).toBeLessThan(100);
    release();
    await services!.jobs.settled(first);
    expect(io.runs).toHaveLength(1);
  });

  it('reaches 100% only after the engine answers docker ping', async () => {
    const io = new FakeInstallerHost();
    io.pingFailures = 3;
    const { install, services } = await start({ io });
    const job = await services!.jobs.settled((await install()).result?.data.jobId as string);
    expect(job).toMatchObject({ state: 'succeeded', progress: 100 });
    expect(io.pings).toBe(4);
  });

  it('fails when the engine never answers, stopping short of 100%', async () => {
    const io = new FakeInstallerHost();
    io.pingFailures = Infinity;
    const reports: number[] = [];
    const lines: string[] = [];
    await expect(
      installColima({
        engineDir: tempDir(),
        home: tempDir(),
        arch: 'arm64',
        host: { cpus: 8, memoryBytes: 16 * 2 ** 30 },
        io,
        signal: new AbortController().signal,
        report: (p) => void reports.push(p),
        appendLog: async (line) => void lines.push(line),
        pingTimeoutMs: 0,
      }),
    ).rejects.toSatisfy((err: unknown) => hlabsCodeOf(err) === 'ENGINE_START_FAILED');
    expect(Math.max(...reports)).toBe(95);
    expect(lines).toContain('Colima started but the engine did not answer');
    expect(lines.at(-1)).toBe('colima start: engine did not answer docker ping');
  });

  it('refuses a download that does not match its pinned checksum', async () => {
    const io = new FakeInstallerHost();
    io.checksums.set(ENGINE_DOWNLOADS.arm64[1]!.url, 'tampered');
    const { install, check, services } = await start({ io });
    const job = await services!.jobs.settled((await install()).result?.data.jobId as string);
    expect(job).toMatchObject({ state: 'failed', hlabsCode: 'ENGINE_START_FAILED' });
    expect(io.runs).toHaveLength(0);
    expect((await check()).result?.data).toMatchObject({
      engine: { state: 'missing', install: { state: 'failed', hlabsCode: 'ENGINE_START_FAILED' } },
      canContinue: false,
    });
  });

  it('is macOS only', async () => {
    const { install } = await start({
      probe: new FakeSystemProbe(142e9, new Set(), { platform: 'linux', name: 'Ubuntu', version: '24.04' }),
    });
    expect((await install()).error?.data.hlabsCode).toBe('ENGINE_INSTALL_UNSUPPORTED');
  });

  it('never installs in e2e (HLABS_DEV_NO_ENGINE_INSTALL)', async () => {
    const io = new FakeInstallerHost();
    const home = tempDir('hlabs-home-');
    const printed: string[] = [];
    const daemon = await startDaemon({
      config: { devNoEngineInstall: true },
      boot: {
        print: (l) => printed.push(l),
        installer: io,
        home,
        engine: { candidates: async () => [], retryMs: 60_000 },
      },
    });
    closers.push(daemon.close);
    const token = new URL(printed.join('').match(/open (\S+)/)![1]!).searchParams.get('token')!;
    const res = (
      (await (
        await fetch(`${daemon.url}/trpc/onboarding.installEngine?batch=1`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-hlabs-setup': token },
          body: '{}',
        })
      ).json()) as Reply[]
    )[0]!;
    expect(res.error?.data.hlabsCode).toBe('ENGINE_INSTALL_UNSUPPORTED');
    expect(io.downloads).toEqual([]);
    expect(daemon.services!.jobs.latest('engine_install')).toBeNull();
  });

  it('does not install when an engine is already present', async () => {
    const { install } = await start({ engineAlready: true });
    expect((await install()).error?.data.hlabsCode).toBe('VALIDATION_FAILED');
  });

  it('sizes the VM to the computer: 4 CPUs and 8 GB, or half the memory under 16 GB', () => {
    const gib = 2 ** 30;
    expect(colimaResources({ cpus: 10, memoryBytes: 32 * gib })).toEqual({ cpus: 4, memoryGib: 8, diskGib: 100 });
    expect(colimaResources({ cpus: 2, memoryBytes: 8 * gib })).toEqual({ cpus: 2, memoryGib: 4, diskGib: 100 });
    expect(colimaResources({ cpus: 8, memoryBytes: 12 * gib }).memoryGib).toBe(6);
  });
});
