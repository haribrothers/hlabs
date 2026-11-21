// The backup plan's schedule (D-133): a 5-field cron (minute hour day-of-month month day-of-week) in local time, read
// by this small evaluator: numbers, `*`, ranges (`3-23`), steps (`*/6`, `3-23/6`) and lists (`1,15`). Day of month and
// day of week combine as cron does: when both are restricted, either may match.

interface Field {
  values: Set<number>;
  any: boolean;
}

const RANGES: Array<[number, number]> = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
];

function field(text: string, [min, max]: [number, number]): Field {
  const values = new Set<number>();
  for (const part of text.split(',')) {
    const [range, stepText] = part.split('/') as [string, string | undefined];
    const step = stepText === undefined ? 1 : Number(stepText);
    let lo = min;
    let hi = max;
    if (range !== '*') {
      const [a, b] = range.split('-');
      lo = Number(a);
      hi = b === undefined ? (stepText === undefined ? lo : max) : Number(b);
    }
    if (![lo, hi, step].every(Number.isInteger) || step < 1 || lo < min || hi > max || lo > hi) {
      throw new Error(`Bad cron field "${text}"`);
    }
    for (let v = lo; v <= hi; v += step) values.add(max === 6 && v === 7 ? 0 : v);
  }
  return { values, any: text === '*' };
}

export interface Cron {
  minute: Field;
  hour: Field;
  dom: Field;
  month: Field;
  dow: Field;
}

export function parseCron(expr: string): Cron {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Bad cron "${expr}"`);
  const [minute, hour, dom, month, dow] = parts.map((p, i) => field(p, RANGES[i]!)) as [
    Field,
    Field,
    Field,
    Field,
    Field,
  ];
  return { minute, hour, dom, month, dow };
}

function matches(c: Cron, d: Date): boolean {
  if (!c.minute.values.has(d.getMinutes()) || !c.hour.values.has(d.getHours())) return false;
  if (!c.month.values.has(d.getMonth() + 1)) return false;
  const domOk = c.dom.values.has(d.getDate());
  const dowOk = c.dow.values.has(d.getDay());
  if (c.dom.any && c.dow.any) return true;
  if (c.dom.any) return dowOk;
  if (c.dow.any) return domOk;
  return domOk || dowOk;
}

/** Looks a year either way at most. */
const LIMIT = 366 * 24 * 60;

/** The first time after `from` (ms) the schedule fires, in local time. */
export function nextRun(expr: string, from: number): number | null {
  const c = parseCron(expr);
  const d = new Date(from);
  d.setSeconds(0, 0);
  for (let i = 0; i < LIMIT; i++) {
    d.setMinutes(d.getMinutes() + 1);
    if (matches(c, d)) return d.getTime();
  }
  return null;
}

/** The last time at or before `at` (ms) the schedule fired. */
export function previousRun(expr: string, at: number): number | null {
  const c = parseCron(expr);
  const d = new Date(at);
  d.setSeconds(0, 0);
  for (let i = 0; i < LIMIT; i++) {
    if (matches(c, d)) return d.getTime();
    d.setMinutes(d.getMinutes() - 1);
  }
  return null;
}

/** How long between runs, for "overdue" (US-BKP-01): the gap from the next run to the one after it. */
export function interval(expr: string, from: number): number | null {
  const a = nextRun(expr, from);
  const b = a === null ? null : nextRun(expr, a);
  return a === null || b === null ? null : b - a;
}
