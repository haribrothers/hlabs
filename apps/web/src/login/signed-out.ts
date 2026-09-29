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

/** The auth-lost handler: many calls failing at once (expired session) lead to one navigation (US-STATE-20). */
export function onceToLogin(opts: {
  location: () => { pathname: string; href: string };
  hasUsers: () => boolean | undefined;
  navigate: (to: NonNullable<ReturnType<typeof loginRedirect>>) => Promise<void>;
}): () => void {
  let going: Promise<void> | null = null;
  return () => {
    if (going) return;
    const to = loginRedirect(opts.location(), { hasUsers: opts.hasUsers() });
    if (to) going = opts.navigate(to).finally(() => (going = null));
  };
}
