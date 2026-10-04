// How the tray writes its numbers (US-INST-05): CPU as a whole percentage, memory in GB with one decimal, free space in
// GB without decimals (TB with one decimal from 1000 GB). A value not read yet is a dash, never zero.
export const NO_VALUE = '–';

/** Memory, like Activity Monitor: 1 GB = 1024³ bytes. */
const GIB = 1024 ** 3;
/** Disk space, like Finder: 1 GB = 1000³ bytes. */
const GB = 1000 ** 3;

export function formatCpu(percent: number | null | undefined): string {
  return percent === null || percent === undefined ? NO_VALUE : `${Math.round(percent)}%`;
}

export function formatMemory(bytes: number | null | undefined): string {
  return bytes === null || bytes === undefined ? NO_VALUE : `${(bytes / GIB).toFixed(1)} GB`;
}

export function formatFree(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return NO_VALUE;
  const gb = bytes / GB;
  return gb >= 1000 ? `${(gb / 1000).toFixed(1)} TB` : `${Math.round(gb)} GB`;
}

/** "Running · 11 apps", "Running · 1 app", "Running · no apps". */
export function appsLine(running: number, words: { none: string; one: string; many: (n: number) => string }): string {
  return running === 0 ? words.none : running === 1 ? words.one : words.many(running);
}
