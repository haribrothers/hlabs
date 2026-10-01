import { SHIPPED_PHASE } from '@hlabs/shared';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { boot, shutdown, type BootDeps } from '../src/boot';
import type { DaemonConfig } from '../src/config';
import { silentLogger } from '../src/logger';
import { Readiness } from '../src/readiness';
import { buildServer } from '../src/server';
import { ServiceHolder } from '../src/services';
import { FakeEngine, fakeMachine } from './fakes/engine';
import { FakeEngineControl } from './fakes/engine-control';
import { FakeSleepBlocker } from './fakes/sleep-blocker';
import { FakeSystemProbe } from './fakes/system';

export function tempDir(prefix = 'hlabsd-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function testConfig(overrides: Partial<DaemonConfig> = {}): DaemonConfig {
  const dataDir = tempDir();
  return {
    version: '0.0.0-test',
    env: 'test',
    phase: SHIPPED_PHASE,
    dev: true,
    host: '127.0.0.1',
    port: 0,
    paths: { dataDir, appDataDir: join(dataDir, 'app-data'), storageRootDefault: join(dataDir, 'storage') },
    // An empty store unless a test points it at one (store/ in the repo, or a fixture).
    resources: { storeDir: join(dataDir, 'store'), binDir: join(dataDir, 'bin'), webFallbackDir: join(dataDir, 'web') },
    proxy: 'none',
    mdns: false,
    dashboardUpstream: '127.0.0.1:0',
    composePrefix: 'hlabs',
    headless: false,
    netmountHelper: '/nonexistent/hlabs-netmount',
    privHelper: '/nonexistent/hlabs-priv',
    dashboardUrl: 'http://127.0.0.1:5173',
    secretStore: 'file',
    logLevel: 'silent',
    devAnonymousAdmin: true,
    devIgnoreEngines: false,
    devNoEngineInstall: false,
    devNoEngineControl: true,
    ...overrides,
  };
}

export const FAKE_SOCKET = '/fake/orbstack.sock';

/** Starts a real daemon (HTTP + boot) on a random loopback port with a fake engine. */
export async function startDaemon(
  options: { config?: Partial<DaemonConfig>; engine?: FakeEngine; skipBoot?: boolean; boot?: Partial<BootDeps> } = {},
) {
  const config = testConfig(options.config);
  const logger = silentLogger();
  const readiness = new Readiness();
  const holder = new ServiceHolder();
  const engine = options.engine ?? new FakeEngine();
  const app = await buildServer({ config, logger, readiness, holder });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const bootDeps: BootDeps = {
    config,
    logger,
    readiness,
    holder,
    engine: {
      candidates: async () => [{ kind: 'orbstack', socketPath: FAKE_SOCKET, managedByHlabs: false }],
      detect: fakeMachine({ [FAKE_SOCKET]: engine }),
      retryMs: 60_000,
    },
    system: new FakeSystemProbe(),
    drives: { externalDrives: async () => [] },
    engineControl: new FakeEngineControl(),
    sleepBlocker: new FakeSleepBlocker(),
    ...options.boot,
  };
  const services = options.skipBoot ? null : await boot(bootDeps);
  return {
    url,
    config,
    readiness,
    holder,
    services,
    engine,
    boot: () => boot(bootDeps),
    async close() {
      await app.close();
      await shutdown(holder.current);
    },
  };
}

/** Reads an SSE response until `until` matches the text so far (or the timeout). */
export async function readSse(res: Response, until: (text: string) => boolean, timeoutMs = 5_000): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline && !until(text)) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise<null>((r) => setTimeout(() => r(null), deadline - Date.now())),
      ]);
      if (!chunk || chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text;
}
