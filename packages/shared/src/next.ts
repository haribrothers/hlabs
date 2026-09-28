// Where to go after logging in (US-AUTH-03, US-AUTH-05, US-AUTH-18): a path on this dashboard, never another site
// and never the log-in page itself. Shared by the daemon and the dashboard.
export function safeNext(next: string | undefined | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  if (next === '/login' || next.startsWith('/login/') || next.startsWith('/login?')) return '/';
  return next;
}
