// When a notification arrived, as the panel says it (US-HOME-13): "Just now", "5 min ago", "3 hours ago",
// "Yesterday, 03:12", "14 Nov, 18:40" (24-hour clock, the browser's time zone), and which group it's in.

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Local midnight at the start of `now`'s day. */
export function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const time = (at: number) => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function notificationTime(at: number, now: number): string {
  const ago = Math.max(0, now - at);
  if (ago < MIN) return 'Just now';
  if (ago < HOUR) return `${Math.floor(ago / MIN)} min ago`;
  const today = startOfDay(now);
  if (at >= today) {
    const hours = Math.floor(ago / HOUR);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  // Yesterday: from the previous local midnight (a DST change makes that day 23 or 25 hours).
  if (at >= startOfDay(today - 1)) return `Yesterday, ${time(at)}`;
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${time(at)}`;
}

/** "Today" since local midnight, else "Earlier". */
export const isToday = (at: number, now: number) => at >= startOfDay(now);
