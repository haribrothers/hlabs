// US-ONB-07 · Get Docker Engine instructions on Linux, and choose start at login (server side).
import { getSetting } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import type { BusEntry } from '../src/events/bus';
import type { EngineCandidate } from '../src/engine/types';
import { FakeEngine, fakeMachine } from './fakes/engine';
import { FakeInstallerHost } from './fakes/installer';
import { FakeSystemProbe } from './fakes/system';
import { startDaemon } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string } } };
const LINUX = { platform: 'linux', name: 'Ubuntu', version: '24.04' } as const;
const DOCKER_SOCK = '/var/run/docker.sock';

async function start(opts: {
  probe: FakeSystemProbe;
  candidates?: EngineCandidate[];
  engines?: Record<string, FakeEngine>;
}) {
  const printed: string[] = [];
  const io = new FakeInstallerHost();
  const daemon = await startDaemon({
    boot: {
      print: (line) => printed.push(line),
      system: opts.probe,
      installer: io,
      engine: {
        candidates: async () => opts.candidates ?? [],
        detect: fakeMachine(opts.engines ?? {}),
        retryMs: 60_000,
      },
    },
  });
  closers.push(daemon.close);
  const token = new URL(printed.join('').match(/open (\S+)/)![1]!).searchParams.get('token')!;
  const headers = { 'content-type': 'application/json', 'x-hlabs-setup': token };
  const engine = async () =>
    (
      ((await (await fetch(`${daemon.url}/trpc/onboarding.checkSystem`, { headers })).json()) as Reply).result!
        .data as {
        engine: Record<string, unknown>;
      }
    ).engine;
  const mutate = async (path: string, input?: unknown) =>
    (
      (await (
        await fetch(`${daemon.url}/trpc/onboarding.${path}?batch=1`, {
          method: 'POST',
          headers,
          body: JSON.stringify(input === undefined ? {} : { 0: input }),
        })
      ).json()) as Reply[]
    )[0]!;
  return { ...daemon, io, engine, mutate };
}

describe('US-ONB-07', () => {
  it('Linux with no engine: missing, and hlabs never installs one itself', async () => {
    const { engine, mutate, io } = await start({ probe: new FakeSystemProbe(142e9, new Set(), LINUX) });
    expect(await engine()).toMatchObject({ kind: null, state: 'missing', level: 'error' });
    expect((await mutate('installEngine')).error?.data.hlabsCode).toBe('ENGINE_INSTALL_UNSUPPORTED');
    expect(io.downloads).toEqual([]);
  });

  it('a Docker socket this account cannot open is noAccess', async () => {
    const probe = new FakeSystemProbe(142e9, new Set(), LINUX);
    probe.noAccess.add(DOCKER_SOCK);
    const { engine } = await start({
      probe,
      candidates: [{ kind: 'docker-engine', socketPath: DOCKER_SOCK, managedByHlabs: false }],
      engines: { [DOCKER_SOCK]: new FakeEngine(false) },
    });
    expect(await engine()).toMatchObject({ kind: 'docker-engine', state: 'noAccess', level: 'error' });
  });

  it('a socket that does not answer is stopped', async () => {
    const sock = '/Users/h/.docker/run/docker.sock';
    const { engine } = await start({
      probe: new FakeSystemProbe(),
      candidates: [{ kind: 'docker-desktop', socketPath: sock, managedByHlabs: false }],
      engines: { [sock]: new FakeEngine(false) },
    });
    expect(await engine()).toMatchObject({ kind: 'docker-desktop', state: 'stopped', level: 'error' });
  });

  it('a quit OrbStack or Docker Desktop on a Mac is stopped, and Colima is not installed next to it', async () => {
    const probe = new FakeSystemProbe();
    probe.apps = ['docker-desktop'];
    const { engine, mutate, io, services } = await start({ probe });
    expect(await engine()).toMatchObject({ kind: 'docker-desktop', state: 'stopped', level: 'error' });
    expect((await mutate('installEngine')).error?.data.hlabsCode).toBe('VALIDATION_FAILED');
    expect(io.downloads).toEqual([]);
    expect(services!.jobs.latest('engine_install')).toBeNull();
  });

  it('Continue with start at login off saves it and asks the tray to apply it', async () => {
    const sock = '/orb.sock';
    const { mutate, services } = await start({
      probe: new FakeSystemProbe(),
      candidates: [{ kind: 'orbstack', socketPath: sock, managedByHlabs: false }],
      engines: { [sock]: new FakeEngine() },
    });
    const events: BusEntry[] = [];
    services!.bus.on((e) => void events.push(e));
    await mutate('setStep', { step: 'system' });
    expect((await mutate('confirmSystem', { startAtLogin: false })).result?.data).toEqual({ ok: true });
    expect(getSetting(services!.db, 'startup').startAtLogin).toBe(false);
    expect(events.filter((e) => e.event.type === 'startup.changeRequested').map((e) => e.event.data)).toEqual([
      { startAtLogin: false },
    ]);
    // Unchanged choice: nothing for the tray to do.
    await mutate('confirmSystem', { startAtLogin: false });
    expect(events.filter((e) => e.event.type === 'startup.changeRequested')).toHaveLength(1);
  });
});
