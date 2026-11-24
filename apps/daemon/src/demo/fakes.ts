// The docs screenshots' pretend computer (HLABS_DEV_DEMO, US-SITE-11, D-177): a Mac mini with hlabs's own Colima,
// whose apps' containers run with the steady figures of ./figures. It stands in for the engine, the host's usage and
// the system probe, so the screenshots look the same on a Mac and on CI's Linux, and never show the machine they were
// taken on. Development only: config refuses HLABS_DEV_DEMO in production.
import { createHash } from 'node:crypto';
import type { ContainerLogLine } from '../engine/log-frames';
import type { ContainerEngine, ContainerState, ContainerStats, EngineCandidate } from '../engine/types';
import type { HostCounters, HostStats } from '../platform/host-stats';
import { NodeSystemProbe, type DiskMedia, type OsInfo } from '../platform/system';
import { appValuesAt, DEMO_APPS, DEMO_MACHINE, DemoCounters, demoApp, hostValuesAt } from './figures';

/** How long the demo apps have been up. */
const UP_MS = 3 * 24 * 60 * 60_000;

const imageId = (appId: string) => `sha256:${createHash('sha256').update(`demo:${appId}`).digest('hex')}`;

/** Each demo app as one running, healthy container; anything else has none. */
export class DemoEngine implements ContainerEngine {
  private readonly counters = new DemoCounters();

  constructor(private readonly projectPrefix: string) {}

  private appOf(project: string) {
    return project.startsWith(`${this.projectPrefix}-`) ? demoApp(project.slice(this.projectPrefix.length + 1)) : null;
  }

  async ping() {
    return true;
  }
  async info() {
    return { ...DEMO_MACHINE.engine };
  }
  async ensureNetwork() {}
  async removeNetwork() {}
  async hasImage() {
    return true;
  }
  async pullImage(_ref: string, onProgress: (p: { current: number; total: number }) => void) {
    onProgress({ current: 100, total: 100 });
  }
  async projectContainers(project: string): Promise<ContainerState[]> {
    const app = this.appOf(project);
    if (!app) return [];
    return [
      {
        id: `demo-${app.id}`,
        service: 'server',
        state: 'running',
        health: 'healthy',
        image: `${app.id}:demo`,
        imageId: imageId(app.id),
        startedAt: Date.now() - UP_MS,
        exitCode: null,
        restartCount: 0,
      },
    ];
  }
  async *containerLogs(containerId: string): AsyncIterable<ContainerLogLine> {
    const now = Date.now();
    const lines = [
      'Starting up',
      'Loaded configuration',
      'Database is up to date',
      'Listening on port 8080',
      'Health check passed',
    ];
    for (const [i, line] of lines.entries()) {
      yield { stream: 'stdout', ts: now - (lines.length - i) * 60_000, line: `[${containerId.slice(5)}] ${line}` };
    }
  }
  async containerStats(containerId: string): Promise<ContainerStats> {
    const app = demoApp(containerId.replace(/^demo-/, ''));
    if (!app) throw new Error(`no container ${containerId}`);
    const now = Date.now();
    const v = appValuesAt(app, now);
    const totals = this.counters.read(app.id, now, v);
    return {
      cpuPercent: v.cpu,
      memBytes: v.memBytes,
      netRxBytes: totals.netRx,
      netTxBytes: totals.netTx,
      diskReadBytes: totals.diskRead,
      diskWriteBytes: totals.diskWrite,
    };
  }
  async removeImage() {}
  async imageSize(image: string) {
    return DEMO_APPS.find((a) => image === imageId(a.id) || image === `${a.id}:demo`)?.imageBytes ?? null;
  }
  async imageInfo(image: string) {
    const app = DEMO_APPS.find((a) => image === imageId(a.id) || image === `${a.id}:demo`);
    return app ? { id: imageId(app.id), sizeBytes: app.imageBytes } : null;
  }
  async containerImageIds() {
    return new Set(DEMO_APPS.map((a) => imageId(a.id)));
  }
  async clearFolder() {}
  async pauseContainer() {}
  async unpauseContainer() {}
  async execInContainer() {
    return { exitCode: 0, output: '' };
  }
}

/** The pretend Mac's CPU, memory, network and disk. */
export class DemoHostStats implements HostStats {
  private readonly totals = new DemoCounters();

  async cpuPercent() {
    return hostValuesAt(Date.now()).cpu;
  }
  async memoryUsedBytes() {
    return hostValuesAt(Date.now()).memBytes;
  }
  async counters(): Promise<HostCounters> {
    const now = Date.now();
    const t = this.totals.read('host', now, hostValuesAt(now));
    return { netRxBytes: t.netRx, netTxBytes: t.netTx, diskReadBytes: t.diskRead, diskWriteBytes: t.diskWrite };
  }
}

/** A Mac mini (M4, 32 GB, macOS 15) with a 1 TB internal SSD, nothing on the web ports and no other engine. */
export class DemoSystemProbe extends NodeSystemProbe {
  constructor(private readonly dataDir: string) {
    super();
  }
  override cpu() {
    return { model: DEMO_MACHINE.cpuModel, arch: 'arm64' };
  }
  override resources() {
    return { cpus: DEMO_MACHINE.cpus, memoryBytes: DEMO_MACHINE.memoryBytes };
  }
  override async os(): Promise<OsInfo> {
    return { ...DEMO_MACHINE.os };
  }
  override async freeBytes() {
    return DEMO_MACHINE.diskFreeBytes;
  }
  override async diskSpace() {
    return { totalBytes: DEMO_MACHINE.diskTotalBytes, freeBytes: DEMO_MACHINE.diskFreeBytes };
  }
  override async diskId() {
    return 'demo-disk';
  }
  override engineStoragePath() {
    return this.dataDir;
  }
  override async diskMedia(): Promise<DiskMedia> {
    return { internal: true, solidState: true };
  }
  override async portInUse() {
    return false;
  }
  override async canAccess() {
    return true;
  }
  override async installedEngineApps() {
    return [];
  }
}

/** hlabs's own Colima, as the demo engine. */
export const DEMO_ENGINE_CANDIDATE: EngineCandidate = {
  kind: 'colima',
  socketPath: '/demo/colima/docker.sock',
  managedByHlabs: true,
};

/** What boot uses instead of this computer's own, for the docs screenshots. */
export function demoBootDeps(opts: { dataDir: string; composePrefix: string }) {
  const engine = new DemoEngine(opts.composePrefix);
  return {
    engine: {
      candidates: async () => [DEMO_ENGINE_CANDIDATE],
      detect: { exists: async () => true, connect: () => engine },
    },
    system: new DemoSystemProbe(opts.dataDir),
    host: new DemoHostStats(),
    totalMemory: () => DEMO_MACHINE.memoryBytes,
    // The demo NAS is never really there, and no backup runs: what the seed wrote stays as it is.
    watchDrives: false,
    scheduleBackups: false,
  };
}
