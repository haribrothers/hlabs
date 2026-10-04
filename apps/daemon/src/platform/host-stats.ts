// How busy this computer is right now: CPU and memory (02 §2.11, Node `os` + systeminformation). The tray's status
// reads it (US-INST-05); the usage sampler builds on it (US-USE-08).
import si from 'systeminformation';

/** Totals since the computer started; the sampler turns two readings into rates (US-USE-08). */
export interface HostCounters {
  netRxBytes: number;
  netTxBytes: number;
  diskReadBytes: number;
  diskWriteBytes: number;
}

export interface HostStats {
  /** Host CPU in use, 0–100, since the previous reading; null when it can't be read. */
  cpuPercent(): Promise<number | null>;
  /** Memory in use by apps and the system (not the file cache), in bytes; null when it can't be read. */
  memoryUsedBytes(): Promise<number | null>;
  /** Network (all real interfaces) and disk totals; null when they can't be read. */
  counters(): Promise<HostCounters | null>;
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

  async counters() {
    try {
      const [nets, interfaces, fs] = await Promise.all([si.networkStats('*'), si.networkInterfaces(), si.fsStats()]);
      // Real interfaces only: not loopback, container bridges or VPN tunnels counted twice.
      const internal = new Set(
        (Array.isArray(interfaces) ? interfaces : [interfaces])
          .filter((i) => i.internal || i.virtual)
          .map((i) => i.iface),
      );
      const real = nets.filter((n) => !internal.has(n.iface));
      return {
        netRxBytes: real.reduce((sum, n) => sum + (n.rx_bytes || 0), 0),
        netTxBytes: real.reduce((sum, n) => sum + (n.tx_bytes || 0), 0),
        diskReadBytes: fs?.rx ?? 0,
        diskWriteBytes: fs?.wx ?? 0,
      };
    } catch {
      return null;
    }
  }
}
