// How the Trash says when (US-FILE-17). Pure, so it's tested without rendering.
const DAY = 86_400_000;
/** Items are deleted for good after this many days (the daemon's TRASH_KEEP_MS). */
export const TRASH_DAYS = 30;

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** "today", "yesterday", "12 days ago". */
export function deletedWhen(at: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** 30 minus whole days since it was deleted, never below 0. */
export const daysLeft = (at: number, now = Date.now()) => Math.max(0, TRASH_DAYS - Math.floor((now - at) / DAY));
