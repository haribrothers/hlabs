import { describe, expect, it } from 'vitest';
import { detectEngine, engineCandidates } from '../src/engine/detect';
import { EngineService } from '../src/engine/service';
import { EventBus } from '../src/events/bus';
import { silentLogger } from '../src/logger';
import { FakeEngine, fakeMachine } from './fakes/engine';

const home = '/Users/hari';

describe('engineCandidates (02 §2.4)', () => {
  it('orders OrbStack, Docker Desktop, Colima (hlabs first), DOCKER_HOST, then /var/run/docker.sock', () => {
    const list = engineCandidates({
      home,
      env: { DOCKER_HOST: 'unix:///run/user/1000/docker.sock' },
      colimaProfiles: ['default', 'hlabs', '_lima'],
      preferred: 'auto',
    });
    expect(list.map((c) => [c.kind, c.socketPath, c.managedByHlabs])).toEqual([
      ['orbstack', '/Users/hari/.orbstack/run/docker.sock', false],
      ['docker-desktop', '/Users/hari/.docker/run/docker.sock', false],
      ['colima', '/Users/hari/.colima/hlabs/docker.sock', true],
      ['colima', '/Users/hari/.colima/default/docker.sock', false],
      ['docker-engine', '/run/user/1000/docker.sock', false],
      ['docker-engine', '/var/run/docker.sock', false],
    ]);
  });

  it('ignores a non-socket DOCKER_HOST and moves the preferred engine first', () => {
    const list = engineCandidates({
      home,
      env: { DOCKER_HOST: 'tcp://1.2.3.4:2375' },
      colimaProfiles: [],
      preferred: 'colima',
    });
    expect(list.map((c) => c.kind)).toEqual(['orbstack', 'docker-desktop', 'docker-engine']);
    const preferred = engineCandidates({ home, env: {}, colimaProfiles: ['hlabs'], preferred: 'colima' });
    expect(preferred[0]).toMatchObject({ kind: 'colima', managedByHlabs: true });
  });
});

describe('detectEngine', () => {
  const candidates = engineCandidates({ home, env: {}, colimaProfiles: ['hlabs'], preferred: 'auto' });
  const orb = '/Users/hari/.orbstack/run/docker.sock';
  const colima = '/Users/hari/.colima/hlabs/docker.sock';

  it('picks the first socket that answers', async () => {
    const { status } = await detectEngine(
      candidates,
      fakeMachine({ [orb]: new FakeEngine(false), [colima]: new FakeEngine(true) }),
    );
    expect(status).toMatchObject({ state: 'running', candidate: { kind: 'colima', managedByHlabs: true } });
  });

  it('reports stopped when a socket exists but nothing answers, missing when there is none', async () => {
    expect((await detectEngine(candidates, fakeMachine({ [orb]: new FakeEngine(false) }))).status).toMatchObject({
      state: 'stopped',
      candidate: { kind: 'orbstack' },
    });
    expect((await detectEngine(candidates, fakeMachine({}))).status).toEqual({ state: 'missing' });
  });
});

describe('EngineService', () => {
  it('starts in engine-stopped mode, then picks the engine up on a retry and emits engine.status', async () => {
    const bus = new EventBus();
    const seen: unknown[] = [];
    bus.on((e) => e.event.type === 'engine.status' && seen.push(e.event.data));
    const engine = new FakeEngine(false);
    const socket = '/s.sock';
    const service = new EngineService({
      bus,
      logger: silentLogger(),
      candidates: async () => [{ kind: 'colima', socketPath: socket, managedByHlabs: true }],
      detect: fakeMachine({ [socket]: engine }),
      retryMs: 60_000,
    });
    expect((await service.start()).state).toBe('stopped');
    expect(service.client).toBeNull();

    engine.running = true;
    expect((await service.check()).state).toBe('running');
    expect(service.client).toBe(engine);
    await service.check(); // unchanged: no new event
    service.stop();

    expect(seen).toEqual([
      { running: false, kind: 'colima', managedByHlabs: true, socketPath: socket },
      { running: true, kind: 'colima', managedByHlabs: true, socketPath: socket },
    ]);
  });
});
