// How Backups says things (US-BKP-01…03, US-BKP-17): times, the schedule, runs and restore points. Pure, so it's
// tested without rendering.
import { formatBytes, formatDuration } from '@hlabs/shared';
import { backupsCopy as copy } from '../copy/backups';

const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "20 Sep" (not the "Sept" some ICU versions give). */
const dayMonth = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

/** "Today, 03:00", "Yesterday, 03:00", "24 Sep, 03:00". */
export function dayTime(at: number, now: number): string {
  const d = new Date(at);
  const n = new Date(now);
  const y = new Date(now - 86_400_000);
  if (sameDay(d, n)) return `Today, ${hm(d)}`;
  if (sameDay(d, y)) return `Yesterday, ${hm(d)}`;
  return `${dayMonth(d)}, ${hm(d)}`;
}

/** "yesterday, 03:00" inside a sentence. */
export const dayTimeLower = (at: number, now: number) => {
  const s = dayTime(at, now);
  return s.startsWith('Today') || s.startsWith('Yesterday') ? s.charAt(0).toLowerCase() + s.slice(1) : s;
};

/** "tonight at 03:00" (before 6 am, within a day), "today at 15:00", "tomorrow at 03:00", "on Sunday at 03:00". */
export function whenNext(at: number, now: number): string {
  const d = new Date(at);
  const n = new Date(now);
  const time = hm(d);
  // Small hours within a day: the coming night.
  if (at - now < 24 * 3_600_000 && d.getHours() < 6) return `tonight at ${time}`;
  if (sameDay(d, n)) return `today at ${time}`;
  if (sameDay(d, new Date(now + 86_400_000))) return `tomorrow at ${time}`;
  if (at - now < 7 * 86_400_000) return `on ${d.toLocaleString('en-GB', { weekday: 'long' })} at ${time}`;
  return `on ${dayMonth(d)} at ${time}`;
}

/** The overview's second line (US-BKP-01): what's included and when the next backup is. */
export function nextLine(nextRunAt: number | null, enabled: boolean, now: number): string {
  if (!enabled || nextRunAt === null) return copy.scheduleOff;
  return copy.nextBackup(whenNext(nextRunAt, now));
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Every day at 03:00", "Every 6 hours from 03:00", "Every Sunday at 03:00" (US-BKP-02, US-BKP-12). */
export function scheduleWords(cron: string): string {
  const [m, h, dom, mon, dow] = cron.trim().split(/\s+/);
  const two = (s: string) => String(Number(s)).padStart(2, '0');
  if (!m || !h || !/^\d+$/.test(m)) return copy.customSchedule;
  const six = /^(\d+)-23\/6$/.exec(h);
  if (six && dom === '*' && mon === '*' && dow === '*') return copy.every6h(`${two(six[1]!)}:${two(m)}`);
  if (!/^\d+$/.test(h) || dom !== '*' || mon !== '*') return copy.customSchedule;
  const time = `${two(h)}:${two(m)}`;
  if (dow === '*') return copy.everyDay(time);
  if (/^[0-7]$/.test(dow ?? '')) return copy.everyWeek(DAYS[Number(dow) % 7]!, time);
  return copy.customSchedule;
}

export const retentionWords = (r: { daily: number; weekly: number; monthly: number }) =>
  copy.keeps(r.daily, r.weekly, r.monthly);

/** "11 apps and 3 Home folders" from the included folder ids (`users/<name>`, `shared`). */
export function includedWords(apps: number, folderIds: string[]): string {
  const homes = folderIds.filter((f) => f.startsWith('users/')).length;
  return copy.included(apps, homes, folderIds.includes('shared'));
}

/** Why a run failed, in a few words (US-BKP-03). */
export function reasonLine(code: string | null, destinationName: string | null): string {
  const say = code ? copy.reasons[code] : undefined;
  return say ? say(destinationName ?? copy.theDestination) : copy.otherReason;
}

export interface RunLike {
  status: string;
  appCount: number | null;
  bytesAdded: number | null;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
  destinationName: string | null;
  retry: boolean;
}

/** "11 apps · 1.2 GB changed · 6 min", or the reason it failed. */
export function runLine(run: RunLike): string {
  if (run.status === 'failed') {
    const reason = reasonLine(run.error, run.destinationName);
    return run.retry ? `${copy.retry} · ${reason}` : reason;
  }
  const parts: string[] = [];
  if (run.appCount !== null) parts.push(copy.apps(run.appCount));
  if (run.bytesAdded !== null) parts.push(copy.changed(formatBytes(run.bytesAdded)));
  if (run.finishedAt !== null)
    parts.push(formatDuration(Math.max(60_000, run.finishedAt - run.startedAt)).replace(/ \d+ s$/, ''));
  return parts.join(' · ');
}

/** "Encrypted · 38 GB used · 42 restore points" (US-BKP-02). */
export function destinationLine(d: { usedBytes: number | null; restorePoints: number | null }): string {
  const parts = [copy.encrypted];
  if (d.usedBytes !== null) parts.push(copy.used(formatBytes(d.usedBytes)));
  if (d.restorePoints !== null) parts.push(copy.restorePoints(d.restorePoints));
  return parts.join(' · ');
}

/** A restore point as the list names it (US-BKP-17): "Today, 03:00", "Weekly · 20 Sep", "Monthly · 1 Sep". */
export function pointLabel(p: { time: number; kind: 'daily' | 'weekly' | 'monthly' }, now: number): string {
  if (p.kind === 'weekly') return copy.weekly(dayMonth(new Date(p.time)));
  if (p.kind === 'monthly') return copy.monthly(dayMonth(new Date(p.time)));
  return dayTime(p.time, now);
}

/** "yesterday's", "today's", "20 Sep's" for "The app restarts with … data" (US-BKP-18). */
export function possessiveDay(at: number, now: number): string {
  const d = new Date(at);
  if (sameDay(d, new Date(now))) return "today's";
  if (sameDay(d, new Date(now - 86_400_000))) return "yesterday's";
  return `${dayMonth(d)}'s`;
}
