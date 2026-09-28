// Signed out on a dashboard page (US-AUTH-14): log in, then come back to it.
import { isLoginPath, isSetupPath } from '../onboarding/first-run';

/** Where to send someone whose session is gone; null on the log-in and setup pages, which handle it themselves. */
export function loginRedirect(location: { pathname: string; href: string }) {
  if (isLoginPath(location.pathname) || isSetupPath(location.pathname)) return null;
  return { to: '/login' as const, search: location.href === '/' ? {} : { next: location.href } };
}
