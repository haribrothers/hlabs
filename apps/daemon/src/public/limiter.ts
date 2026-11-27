// Failed sign-ins on public addresses, per visitor address (US-APP-29, D-178): more than 20 in 10 minutes and that
// address is refused for an hour. Caddy's standard build has no rate limiter, so it lives here, beside hlabs's own
// lockout per username and address (07 §7.2). Kept in memory: a restart forgets it, as it forgets an attacker's pace.

export const PUBLIC_FAILURE_LIMIT = 20;
export const PUBLIC_FAILURE_WINDOW_MS = 10 * 60_000;
export const PUBLIC_REFUSE_MS = 60 * 60_000;

export interface Refusal {
  ip: string;
  until: number;
  /** Failures in the 10 minutes before it was refused. */
  failures: number;
  /** The public app those sign-ins were on (the last one). */
  appId: string;
}

export class SignInLimiter {
  private readonly failures = new Map<string, number[]>();
  private readonly refusals = new Map<string, Refusal>();

  /** When a refused address may try again, or null when it may now. */
  refusedUntil(ip: string, now: number): number | null {
    const r = this.refusals.get(ip);
    if (!r) return null;
    if (r.until <= now) {
      this.refusals.delete(ip);
      return null;
    }
    return r.until;
  }

  /** A failed sign-in from `ip`; `refused` once it's the one over the limit (the start of the hour). */
  fail(ip: string, appId: string, now: number): { refused: Refusal | null; failures: number } {
    const recent = (this.failures.get(ip) ?? []).filter((t) => now - t < PUBLIC_FAILURE_WINDOW_MS);
    recent.push(now);
    this.failures.set(ip, recent);
    if (recent.length > PUBLIC_FAILURE_LIMIT && this.refusedUntil(ip, now) === null) {
      const refusal = { ip, until: now + PUBLIC_REFUSE_MS, failures: recent.length, appId };
      this.refusals.set(ip, refusal);
      this.failures.delete(ip);
      return { refused: refusal, failures: recent.length };
    }
    // Forget addresses that stopped trying, so the map doesn't grow with every visitor.
    if (this.failures.size > 10_000) {
      for (const [key, times] of this.failures) {
        if (now - (times.at(-1) ?? 0) >= PUBLIC_FAILURE_WINDOW_MS) this.failures.delete(key);
      }
    }
    return { refused: null, failures: recent.length };
  }

  /** Addresses refused now, for an app's Visits (or all). */
  refused(now: number, appId?: string): Refusal[] {
    return [...this.refusals.values()].filter((r) => r.until > now && (!appId || r.appId === appId));
  }

  clear(): void {
    this.failures.clear();
    this.refusals.clear();
  }
}
