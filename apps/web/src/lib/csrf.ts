// The CSRF token from auth.me, sent as `x-hlabs-csrf` on every call once there is a session (07 §7.3).
let token: string | null = null;

export const CSRF_HEADER = 'x-hlabs-csrf';

export function setCsrfToken(value: string | null): void {
  token = value;
}

export function csrfHeaders(): Record<string, string> {
  return token ? { [CSRF_HEADER]: token } : {};
}
