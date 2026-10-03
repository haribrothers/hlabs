// How Live usage writes numbers (US-USE-01): whole percents, bytes in 1000-based units with at most one decimal,
// rates per second. Memory uses 1024-based units, as macOS and the menu bar do, so a 16 GB Mac reads "16 GB".
import { formatBytes } from '@hlabs/shared';

const GIB = 1024 ** 3;

export const formatPercent = (v: number) => `${Math.round(v)}%`;

export function formatMemory(bytes: number): string {
  if (bytes >= GIB) {
    const gb = bytes / GIB;
    return `${gb < 10 ? Math.round(gb * 10) / 10 : Math.round(gb)} GB`;
  }
  return formatBytes(bytes);
}

/** "2.1 MB/s"; nothing moving reads "0 KB/s". */
export function formatRate(bytesPerSecond: number): string {
  return bytesPerSecond < 1 ? '0 KB/s' : `${formatBytes(bytesPerSecond)}/s`;
}

/** An app's CPU in the table (US-USE-06): its share of the whole computer, one decimal ("7.2%"). */
export const formatAppCpu = (v: number) => `${(Math.round(v * 10) / 10).toFixed(1)}%`;
