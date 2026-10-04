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
  /** Path prefix → disk; anything else is on 'disk1' (one disk, unless a test adds a drive). */
  disks = new Map<string, string>();
  async diskId(path: string) {
    for (const [prefix, id] of this.disks) if (path === prefix || path.startsWith(`${prefix}/`)) return id;
    return 'disk1';
  }
  engineStoragePath(kind: EngineKind) {
    return kind === 'docker-engine' ? '/var/lib/docker' : '/Users/hari';
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
