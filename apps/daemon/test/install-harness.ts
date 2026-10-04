// A daemon ready to install store apps: a signed-in admin, a storage root, the fake engine and compose, instant health
// checks and a copy of the built-in store.
import { storageLocations } from '@hlabs/db';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { HealthProbes } from '../src/apps/health';
import type { EngineControl } from '../src/engine/control';
import type { StoreHost } from '../src/store/service';
import { daemonWithAdmin } from './admin-session';
import { FakeCompose } from './fakes/compose';
import { FakeEngine } from './fakes/engine';
import { FakeSystemProbe } from './fakes/system';
import { tempDir } from './helpers';
import { storeFixture } from './store-fixture';

export function fakeProbes(http: (url: string) => number | null = () => 200): HealthProbes & { clock: number } {
  const probes = {
    clock: 0,
    http: async (url: string) => http(url),
    tcp: async () => true,
    sleep: async (ms: number) => void (probes.clock += ms),
    now: () => probes.clock,
  };
  return probes;
}

export async function installDaemon(
  closers: Array<() => Promise<void>>,
  opts: {
    amd64Only?: string[];
    host?: StoreHost;
    freeSpace?: number;
    probes?: HealthProbes;
    busyPorts?: number[];
    storeDir?: string;
    /** Records engine starts and restarts (US-STATE-09); a quiet fake otherwise. */
    engineControl?: EngineControl;
    /** The phase whose onboarding steps run (DaemonConfig.phase). */
    phase?: number;
  } = {},
) {
  const engine = new FakeEngine();
  const compose = new FakeCompose(engine);
  const busy = new Set(opts.busyPorts ?? []);
  const d = await daemonWithAdmin(
    closers,
    {
      resources: {
        storeDir: opts.storeDir ?? storeFixture({ amd64Only: opts.amd64Only }),
        binDir: '/none',
        webFallbackDir: '/none',
        webDir: '/none',
      },
      ...(opts.phase === undefined ? {} : { phase: opts.phase }),
    } as never,
    {
      compose,
      healthProbes: opts.probes ?? fakeProbes(),
      isPortFree: async (p) => !busy.has(p),
      storeHost: opts.host ?? { os: 'linux', arm64: false },
      system: new FakeSystemProbe(opts.freeSpace),
      ...(opts.engineControl ? { engineControl: opts.engineControl } : {}),
    },
    engine,
  );
  const s = d.services!;
  const root = join(tempDir('root-'), 'hlabs');
  mkdirSync(join(root, 'users', 'hari'), { recursive: true });
  s.db
    .insert(storageLocations)
    .values({ id: 'root', kind: 'local', name: 'This computer', path: root, isRoot: true })
    .run();
  return { d, s, engine, compose, root, busy };
}
