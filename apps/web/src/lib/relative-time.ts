// "2 hours ago", "3 days ago": how long ago something happened, in words.
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 86_400_000],
  ['month', 30 * 86_400_000],
  ['week', 7 * 86_400_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

const format = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

export function timeAgo(at: number, now = Date.now()): string {
  const ms = Math.max(0, now - at);
  for (const [unit, size] of UNITS) {
    if (ms >= size) return format.format(-Math.floor(ms / size), unit);
  }
  return 'just now';
}

const days = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "today", "yesterday", "3 days ago", then weeks and longer as `timeAgo` says them. */
export function daysAgo(at: number, now = Date.now()): string {
  const n = Math.floor(Math.max(0, now - at) / 86_400_000);
  return n < 7 ? days.format(-n, 'day') : timeAgo(at, now);
}
