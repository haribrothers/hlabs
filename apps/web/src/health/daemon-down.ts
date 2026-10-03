// The "Can't reach hlabs" loop (US-STATE-04…06), without React, so the fallback page (plain HTML) and the dashboard
// share it: ask /healthz every 5 seconds (or now, on Try now) and say when hlabs is back.
export interface HealthCheck {
  ok: boolean;
  /** The 503 body's reason (starting, migration_failed, …), or null when there was no answer. */
  reason: string | null;
  /** While starting or updating: which step of how many, and its label. */
  step?: number;
  steps?: number;
  stepLabel?: string;
}

/** One /healthz request; no answer within 4 seconds counts as no answer. */
export async function checkHealth(url = '/healthz', timeoutMs = 4_000): Promise<HealthCheck> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) return { ok: true, reason: null };
    const body = (await res.json().catch(() => null)) as {
      reason?: unknown;
      step?: unknown;
      steps?: unknown;
      stepLabel?: unknown;
    } | null;
    return {
      ok: false,
      reason: typeof body?.reason === 'string' ? body.reason : null,
      ...(typeof body?.step === 'number' ? { step: body.step } : {}),
      ...(typeof body?.steps === 'number' ? { steps: body.steps } : {}),
      ...(typeof body?.stepLabel === 'string' ? { stepLabel: body.stepLabel } : {}),
    };
  } catch {
    return { ok: false, reason: null };
  }
}

export interface DaemonDownState {
  reason: string | null;
  /** A check is in flight ("Trying again…"). */
  checking: boolean;
  /** Seconds until the next check, counting down once a second. */
  secondsLeft: number;
}

/** Seconds between checks while the page is visible, and while it's hidden (US-STATE-06). */
export const POLL_SECONDS = 5;
export const HIDDEN_POLL_SECONDS = 30;
export const POLL_MS = POLL_SECONDS * 1_000;

/** Whether the page is hidden, and a way to hear when that changes; the document by default. */
export interface Visibility {
  hidden(): boolean;
  onChange(listener: () => void): () => void;
}

const documentVisibility: Visibility = {
  hidden: () => typeof document !== 'undefined' && document.hidden,
  onChange: (listener) => {
    if (typeof document === 'undefined') return () => {};
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  },
};

export class DaemonDownController {
  private state: DaemonDownState;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private stopped = true;
  /** Bumped on stop, so a check from before a stop (React StrictMode restarts effects) is ignored. */
  private generation = 0;
  private unwatch: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly opts: {
      check: () => Promise<HealthCheck>;
      /** hlabs answers again. */
      onBack: () => void;
      reason?: string | null;
      visibility?: Visibility;
    },
  ) {
    this.state = { reason: opts.reason ?? null, checking: false, secondsLeft: POLL_SECONDS };
  }

  private get visibility(): Visibility {
    return this.opts.visibility ?? documentVisibility;
  }

  get snapshot(): DaemonDownState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** `now`: check at once (the fallback page, to learn why straight away); otherwise count down first. */
  start(opts: { now?: boolean } = {}): void {
    this.stopped = false;
    // Coming back to the tab checks at once; while hidden, checks slow to every 30 seconds.
    this.unwatch = this.visibility.onChange(() => {
      if (this.stopped) return;
      if (this.visibility.hidden()) this.countFrom(HIDDEN_POLL_SECONDS);
      else void this.run();
    });
    if (opts.now) void this.run();
    else this.countFrom(this.interval());
  }

  stop(): void {
    this.stopped = true;
    this.generation++;
    this.clearTicker();
    this.unwatch?.();
    this.unwatch = null;
  }

  /** Try now: check at once; the countdown starts again afterwards. */
  tryNow(): void {
    if (this.state.checking || this.stopped) return;
    void this.run();
  }

  private interval() {
    return this.visibility.hidden() ? HIDDEN_POLL_SECONDS : POLL_SECONDS;
  }

  private set(next: Partial<DaemonDownState>) {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  private clearTicker() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  /** Count down once a second, then check. */
  private countFrom(seconds: number) {
    this.clearTicker();
    if (this.stopped) return;
    this.set({ secondsLeft: seconds });
    this.ticker = setInterval(() => {
      const left = this.state.secondsLeft - 1;
      if (left > 0) this.set({ secondsLeft: left });
      else void this.run();
    }, 1_000);
  }

  private async run() {
    this.clearTicker();
    const generation = this.generation;
    this.set({ checking: true });
    const result = await this.opts.check();
    if (this.stopped || generation !== this.generation) return;
    if (result.ok) {
      this.stop();
      this.set({ checking: false });
      this.opts.onBack();
      return;
    }
    this.set({ checking: false, reason: result.reason });
    this.countFrom(this.interval());
  }
}
