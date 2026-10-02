import type { HostStats } from '../../src/platform/host-stats';

/** A computer that's 18% busy with 9.4 GB of memory in use, unless a test says otherwise. */
export class FakeHostStats implements HostStats {
  constructor(
    public cpu: number | null = 18.4,
    public memory: number | null = 9.4e9,
  ) {}
  async cpuPercent() {
    return this.cpu;
  }
  async memoryUsedBytes() {
    return this.memory;
  }
}
