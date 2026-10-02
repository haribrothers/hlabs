// How busy this computer is right now: CPU and memory (02 §2.11, Node `os` + systeminformation). The tray's status
// reads it (US-INST-05); the usage sampler builds on it (US-USE-08).
import si from 'systeminformation';

export interface HostStats {
  /** Host CPU in use, 0–100, since the previous reading; null when it can't be read. */
  cpuPercent(): Promise<number | null>;
  /** Memory in use by apps and the system (not the file cache), in bytes; null when it can't be read. */
  memoryUsedBytes(): Promise<number | null>;
}

export class SystemHostStats implements HostStats {
  async cpuPercent() {
    try {
      const load = await si.currentLoad();
      return Number.isFinite(load.currentLoad) ? load.currentLoad : null;
    } catch {
      return null;
    }
  }

  async memoryUsedBytes() {
    try {
      // `active` is what macOS Activity Monitor calls memory used; `used` would count the file cache.
      return (await si.mem()).active;
    } catch {
      return null;
    }
  }
}
