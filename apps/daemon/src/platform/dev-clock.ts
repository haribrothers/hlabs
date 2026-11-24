// Development only (HLABS_DEV_CLOCK, US-SITE-11, D-177): hlabsd's clock starts at a given time and runs on from there,
// so the docs screenshots' instance always shows the same day ("Good morning", "Today, 03:00"). Only `Date` moves;
// timers, `performance.now()` and other processes (Vite, the browser) keep the real time. Refused in production.

/** Makes `Date` in this process start at `startMs` now. Returns the offset applied (ms). */
export function startClockAt(startMs: number): number {
  const RealDate = globalThis.Date;
  const offset = startMs - RealDate.now();
  const now = () => RealDate.now() + offset;
  globalThis.Date = new Proxy(RealDate, {
    // `new Date()` is the shifted now; any other `new Date(…)` is as asked.
    construct: (target, args: unknown[]) =>
      args.length === 0 ? new target(now()) : new target(...(args as [string | number | Date])),
    // `Date()` called as a function returns the time as text.
    apply: () => new RealDate(now()).toString(),
    get: (target, prop, receiver) => (prop === 'now' ? now : Reflect.get(target, prop, receiver)),
  });
  return offset;
}
