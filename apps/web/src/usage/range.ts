// The time range (US-USE-03): 1 hour unless this browser chose another before. Kept in local storage, which may be
// unavailable (private windows): then it's just 1 hour each time.
import { useCallback, useState } from 'react';

export type UsageRange = '1h' | '24h' | '7d';
export const RANGES: readonly UsageRange[] = ['1h', '24h', '7d'];
export const RANGE_KEY = 'hlabs.usage.range';

function read(): UsageRange {
  try {
    const saved = localStorage.getItem(RANGE_KEY);
    return RANGES.includes(saved as UsageRange) ? (saved as UsageRange) : '1h';
  } catch {
    return '1h';
  }
}

export function useUsageRange(): [UsageRange, (range: UsageRange) => void] {
  const [range, setRange] = useState<UsageRange>(read);
  const choose = useCallback((next: UsageRange) => {
    setRange(next);
    try {
      localStorage.setItem(RANGE_KEY, next);
    } catch {
      // Not remembered; nothing else changes.
    }
  }, []);
  return [range, choose];
}

/** Local time for an x label: "16:32", or with the day for 7 days ("Tue 14:00"). Timestamps are UTC ms. */
export function timeLabel(ts: number, range: UsageRange): string {
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ts);
  if (range !== '7d') return time;
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(ts);
  return `${day} ${time}`;
}
