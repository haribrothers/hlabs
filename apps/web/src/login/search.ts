// Search params kept on every log-in link (US-AUTH-05): `next`, and the chosen account on the password view.
export interface LoginSearch {
  next?: string;
}

export const validateLoginSearch = (search: Record<string, unknown>): LoginSearch =>
  typeof search.next === 'string' && search.next ? { next: search.next } : {};

export const withNext = (next: string | undefined) => (next ? { next } : {});
