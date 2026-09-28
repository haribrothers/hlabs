// Search params kept on every log-in link (US-AUTH-05): `next`, and `reason` when a password screen is shown again
// after the two-factor step timed out (US-AUTH-08).
export interface LoginSearch {
  next?: string;
  reason?: 'timeout';
}

export const validateLoginSearch = (search: Record<string, unknown>): LoginSearch => ({
  ...(typeof search.next === 'string' && search.next ? { next: search.next } : {}),
  ...(search.reason === 'timeout' ? { reason: 'timeout' as const } : {}),
});

export const withNext = (next: string | undefined) => (next ? { next } : {});
