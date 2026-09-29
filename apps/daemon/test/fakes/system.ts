import type { EngineKind } from '@hlabs/api';
import type { OsInfo, SystemProbe } from '../../src/platform/system';

/** A roomy Mac with ports 80 and 443 free, unless a test says otherwise. */
export class FakeSystemProbe implements SystemProbe {
  constructor(
    public freeSpace = 142e9,
    public portsInUse = new Set<number>(),
    public osInfo: OsInfo = { platform: 'darwin', name: 'macOS', version: '15' },
  ) {}
  cpu() {
    return { model: 'Apple M2', arch: 'arm64' };
  }
  resources() {
    return { cpus: 8, memoryBytes: 16 * 2 ** 30 };
  }
  async os() {
    return this.osInfo;
  }
  async freeBytes() {
    return this.freeSpace;
  }
  totalSpace = 256e9;
  async diskSpace() {
    return { totalBytes: this.totalSpace, freeBytes: this.freeSpace };
  }
  async portInUse(port: number) {
    return this.portsInUse.has(port);
  }
  /** Sockets this account can't open. */
  noAccess = new Set<string>();
  /** Engine apps installed but maybe not running. */
  apps: EngineKind[] = [];
  async canAccess(socketPath: string) {
    return !this.noAccess.has(socketPath);
  }
  async installedEngineApps() {
    return this.apps;
  }
}
