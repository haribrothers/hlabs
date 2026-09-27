// US-ONB-06 · Recover from a failed system check (the Colima install fails).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { colimaSocket } from '../src/engine/colima-installer';
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
type Install = { jobId: string; state: string; lastLogLine: string | null; hlabsCode: string | null; log?: string };

async function start(io: FakeInstallerHost) {
  const home = tempDir('hlabs-home-');
  const socket = colimaSocket(home);
  const available: EngineCandidate[] = [];
  io.onStarted = () => void available.push({ kind: 'colima', socketPath: socket, managedByHlabs: true });
  const printed: string[] = [];
  const daemon = await startDaemon({
    boot: {
      print: (line) => printed.push(line),
      system: new FakeSystemProbe(142e9, new Set([443])),
      installer: io,
      home,
      engine: {
        candidates: async () => available,
        detect: fakeMachine({ [socket]: new FakeEngine(), '/orb.sock': new FakeEngine() }),
        retryMs: 60_000,
      },
    },
  });
  closers.push(daemon.close);
  const engineDir = join(daemon.config.paths.dataDir, 'engine');
  const token = new URL(printed.join('').match(/open (\S+)/)![1]!).searchParams.get('token')!;
  const headers = { 'content-type': 'application/json', 'x-hlabs-setup': token };
  const install = async () =>
    (
      (await (
        await fetch(`${daemon.url}/trpc/onboarding.installEngine?batch=1`, { method: 'POST', headers, body: '{}' })
      ).json()) as Reply[]
    )[0]!;
  const check = async (includeLog = false) =>
    (
      (await (
        await fetch(
          `${daemon.url}/trpc/onboarding.checkSystem?input=${encodeURIComponent(JSON.stringify({ includeLog }))}`,
          { headers },
        )
      ).json()) as Reply
    ).result!.data as {
      engine: { state: string; kind: string | null; install: Install };
      ports: unknown;
      canContinue: boolean;
    };
  const installAndSettle = async () => daemon.services!.jobs.settled((await install()).result!.data.jobId as string);
  return { ...daemon, home, engineDir, available, install, check, installAndSettle };
}

describe('US-ONB-06', () => {
  it('a stalled download fails with its last log line and code; the port warning still shows', async () => {
    const io = new FakeInstallerHost();
    io.stallUrl = ENGINE_DOWNLOADS.arm64[1]!.url;
    const { installAndSettle, check } = await start(io);
    expect(await installAndSettle()).toMatchObject({ state: 'failed', hlabsCode: 'ENGINE_DOWNLOAD_TIMEOUT' });
    const result = await check();
    expect(result.engine.install).toMatchObject({
      state: 'failed',
      hlabsCode: 'ENGINE_DOWNLOAD_TIMEOUT',
      lastLogLine: 'lima download: download timed out after 120s',
    });
    expect(result.canContinue).toBe(false);
    expect(result.ports).toMatchObject({ https: { inUse: true, use: 8443 }, level: 'warning' });
  });

  it('removes the hlabs Colima profile and every partly installed file, keeping the log', async () => {
    const io = new FakeInstallerHost();
    io.failStart = true;
    const { installAndSettle, check, engineDir, home } = await start(io);
    io.existing.add(join(engineDir, 'bin', 'colima'));
    io.existing.add(join(home, '.colima', '_lima', 'colima-hlabs'));
    io.folders.set(engineDir, ['bin', 'downloads', 'share', 'libexec', 'docker-config', 'install.log']);

    expect(await installAndSettle()).toMatchObject({ state: 'failed', hlabsCode: 'ENGINE_START_FAILED' });
    const del = io.runs.find((r) => r.args[0] === 'delete')!;
    expect(del.args).toEqual(['delete', '--profile', 'hlabs', '--force']);
    expect(del.env.DOCKER_CONFIG).toBe(join(engineDir, 'docker-config'));
    expect(io.removed.sort()).toEqual(
      ['bin', 'docker-config', 'downloads', 'libexec', 'share'].map((n) => join(engineDir, n)),
    );

    const { install } = (await check(true)).engine;
    expect(install.lastLogLine).toBe('colima start: colima exited with code 1');
    expect(install.log).toBe(readFileSync(join(engineDir, 'install.log'), 'utf8'));
    expect(install.log).toContain('colima start: colima exited with code 1');
    expect(install.log).toContain('Removed the partly installed files');
  });

  it('does not run colima delete when nothing was created', async () => {
    const io = new FakeInstallerHost();
    io.stallUrl = ENGINE_DOWNLOADS.arm64[0]!.url;
    const { installAndSettle } = await start(io);
    await installAndSettle();
    expect(io.runs).toEqual([]);
  });

  it('Retry installs again when still nothing is found', async () => {
    const io = new FakeInstallerHost();
    io.failStart = true;
    const { installAndSettle, check } = await start(io);
    const failed = await installAndSettle();
    io.failStart = false;
    const retried = await installAndSettle();
    expect(retried!.id).not.toBe(failed!.id);
    expect(retried).toMatchObject({ state: 'succeeded' });
    expect((await check()).engine).toMatchObject({ kind: 'colima', state: 'running' });
  });

  it('Retry uses an engine installed in the meantime instead of reinstalling', async () => {
    const io = new FakeInstallerHost();
    io.failStart = true;
    const { installAndSettle, install, check, available } = await start(io);
    await installAndSettle();
    available.push({ kind: 'orbstack', socketPath: '/orb.sock', managedByHlabs: false });
    expect((await install()).error?.data.hlabsCode).toBe('VALIDATION_FAILED');
    const result = await check();
    expect(result.engine).toMatchObject({ kind: 'orbstack', state: 'running' });
    expect(result.canContinue).toBe(true);
  });

  it('a Retry while the failed install is still cleaning up is ignored', async () => {
    const io = new FakeInstallerHost();
    io.failStart = true;
    let release!: () => void;
    io.holdDelete = new Promise((r) => (release = r));
    const { install, engineDir, home, services } = await start(io);
    io.existing.add(join(engineDir, 'bin', 'colima'));
    io.existing.add(join(home, '.colima', 'hlabs'));
    const first = (await install()).result!.data.jobId as string;
    try {
      // Wait until the failed install is inside `colima delete` (held).
      await vi.waitFor(() => expect(io.runs.some((r) => r.args[0] === 'delete')).toBe(true), { timeout: 5_000 });
      expect((await install()).result!.data.jobId).toBe(first);
    } finally {
      release();
    }
    await services!.jobs.settled(first);
  });
});
