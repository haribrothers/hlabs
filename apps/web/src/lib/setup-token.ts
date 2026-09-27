// The one-time setup token from the setup URL (US-ONB-01, D-013). It is kept in sessionStorage for this
// tab only, removed from the address bar, and sent as `x-hlabs-setup` on onboarding calls.
const KEY = 'hlabs.setupToken';
export const SETUP_PATH = '/setup';
export const SETUP_HEADER = 'x-hlabs-setup';

type Env = Pick<Window, 'location' | 'history' | 'sessionStorage'>;

/** Moves `?token=` from a setup URL into sessionStorage and strips it from the address bar. */
export function captureSetupToken(env: Env = window): void {
  const url = new URL(env.location.href);
  const token = url.searchParams.get('token');
  if (url.pathname !== SETUP_PATH || !token) return;
  try {
    env.sessionStorage.setItem(KEY, token);
  } catch {
    // Storage blocked: onboarding calls will be refused and the page says to finish setup on the computer.
  }
  url.searchParams.delete('token');
  env.history.replaceState(env.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

export function readSetupToken(storage: Storage = window.sessionStorage): string | null {
  try {
    return storage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearSetupToken(storage: Storage = window.sessionStorage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Headers for a batch of tRPC calls: the setup token goes only with onboarding procedures. */
export function setupHeaders(paths: readonly string[], token = readSetupToken()): Record<string, string> {
  return token && paths.some((path) => path.startsWith('onboarding.')) ? { [SETUP_HEADER]: token } : {};
}
