// Formatting helpers shared by the dashboard, tray and CLI. Decimal units, like macOS Finder.
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

/** 1234567 → "1.2 MB". Whole numbers under 10 keep one decimal ("2.5 GB"), larger ones don't ("250 GB"). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1000) return `${Math.round(bytes)} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < BYTE_UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  // Rounding can reach 1000 (999.95 KB → "1000 KB"); step up a unit instead.
  if (rounded >= 1000 && unit < BYTE_UNITS.length - 1) return `1 ${BYTE_UNITS[unit + 1]}`;
  return `${rounded} ${BYTE_UNITS[unit]}`;
}

/** 90_000 → "1 min 30 s", 3_600_000 → "1 h". Shows at most two parts. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const parts: Array<[number, string]> = [
    [Math.floor(ms / 86_400_000), 'd'],
    [Math.floor(ms / 3_600_000) % 24, 'h'],
    [Math.floor(ms / 60_000) % 60, 'min'],
    [Math.floor(ms / 1000) % 60, 's'],
  ];
  const first = parts.findIndex(([n]) => n > 0);
  return parts
    .slice(first, first + 2)
    .filter(([n]) => n > 0)
    .map(([n, u]) => `${n} ${u}`)
    .join(' ');
}

/** 0.4567 → "46%". */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—';
  return `${Math.round(ratio * 100)}%`;
}
