// Signed out on a dashboard page (US-AUTH-14): log in, then come back to it.
import { isLoginPath, isSetupPath } from '../onboarding/first-run';

/**
 * Where to send someone whose session is gone; null on the log-in and setup pages, which handle it themselves, and
 * when nobody has an account yet (nobody could log in).
 */
export function loginRedirect(location: { pathname: string; href: string }, opts: { hasUsers?: boolean } = {}) {
  if (opts.hasUsers === false) return null;
  if (isLoginPath(location.pathname) || isSetupPath(location.pathname)) return null;
  return { to: '/login' as const, search: location.href === '/' ? {} : { next: location.href } };
}
