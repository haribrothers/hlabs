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
  async os() {
    return this.osInfo;
  }
  async freeBytes() {
    return this.freeSpace;
  }
  async portInUse(port: number) {
    return this.portsInUse.has(port);
  }
}
