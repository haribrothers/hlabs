// The "Can't reach hlabs" loop (US-STATE-04…06), without React, so the fallback page (plain HTML) and the dashboard
// share it: ask /healthz every 5 seconds (or now, on Try now) and say when hlabs is back.
export interface HealthCheck {
  ok: boolean;
  /** The 503 body's reason (starting, migration_failed, …), or null when there was no answer. */
  reason: string | null;
}

/** One /healthz request; no answer within 4 seconds counts as no answer. */
export async function checkHealth(url = '/healthz', timeoutMs = 4_000): Promise<HealthCheck> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) return { ok: true, reason: null };
    const body = (await res.json().catch(() => null)) as { reason?: unknown } | null;
    return { ok: false, reason: typeof body?.reason === 'string' ? body.reason : null };
  } catch {
    return { ok: false, reason: null };
  }
}

export interface DaemonDownState {
  reason: string | null;
  /** A check is in flight. */
  checking: boolean;
}

export const POLL_MS = 5_000;

export class DaemonDownController {
  private state: DaemonDownState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly opts: {
      check: () => Promise<HealthCheck>;
      /** hlabs answers again. */
      onBack: () => void;
      reason?: string | null;
    },
  ) {
    this.state = { reason: opts.reason ?? null, checking: false };
  }

  get snapshot(): DaemonDownState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** `now`: check at once (the fallback page, to learn why straight away); otherwise in 5 seconds. */
  start(opts: { now?: boolean } = {}): void {
    this.stopped = false;
    if (opts.now) void this.run();
    else this.schedule();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Try now: check at once. */
  tryNow(): void {
    if (this.state.checking) return;
    void this.run();
  }

  private set(next: Partial<DaemonDownState>) {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.run(), POLL_MS);
  }

  private async run() {
    if (this.timer) clearTimeout(this.timer);
    this.set({ checking: true });
    const result = await this.opts.check();
    if (this.stopped) return;
    if (result.ok) {
      this.stop();
      this.set({ checking: false });
      this.opts.onBack();
      return;
    }
    this.set({ checking: false, reason: result.reason });
    this.schedule();
  }
}
