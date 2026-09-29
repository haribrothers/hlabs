// When the daemon doesn't answer (US-STATE-04), Caddy answers instead: page requests get the fallback page
// (<appResources>/web-fallback/index.html) with status 503, not a 502, and /healthz gets { reason:
// "daemon_unreachable" }. These are the `errors` routes of the dashboard server in Caddy's JSON config; the Caddy
// client that loads them arrives in phase 2.
export const DAEMON_UNREACHABLE_BODY = JSON.stringify({ reason: 'daemon_unreachable' });

export function fallbackErrorRoutes(webFallbackDir: string) {
  const unreachable = { expression: '{http.error.status_code} in [502, 503, 504]' };
  const noStore = { 'Cache-Control': ['no-store'] };
  return {
    routes: [
      {
        match: [{ ...unreachable, path: ['/healthz'] }],
        handle: [
          {
            handler: 'static_response',
            status_code: 503,
            headers: { ...noStore, 'Content-Type': ['application/json'] },
            body: DAEMON_UNREACHABLE_BODY,
          },
        ],
        terminal: true,
      },
      {
        match: [unreachable],
        handle: [
          { handler: 'headers', response: { set: noStore } },
          { handler: 'rewrite', uri: '/index.html' },
          { handler: 'file_server', root: webFallbackDir, status_code: 503 },
        ],
        terminal: true,
      },
    ],
  };
}
