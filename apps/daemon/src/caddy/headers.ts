// Headers only Caddy itself sets on the way to the daemon or an app; whatever a browser sends under these names is
// dropped first.

/** Who someone is: set only by forward auth. */
export const IDENTITY_HEADERS = ['X-Hlabs-User', 'X-Hlabs-Role'];

/**
 * Which public address a request came to (D-178): set only by the public listener, and dropped everywhere else (the
 * dashboard and every app route), so nobody on the home network can pass as a public visitor.
 */
export const PUBLIC_HOST_HEADER = 'X-Hlabs-Public-Host';

/**
 * Where a request came from (D-182): `public` is set only by the public listener's dashboard route, and dropped from
 * every request on every other server and route (the dashboard, every app, apps' own ports, the plain-HTTP server),
 * so only the public listener can say a request came from the internet.
 */
export const VIA_HEADER = 'X-Hlabs-Via';

/** Headers only Caddy sets on the way to the daemon or an app: whatever a client sent under these names goes first. */
export const CADDY_ONLY_HEADERS = [...IDENTITY_HEADERS, PUBLIC_HOST_HEADER, VIA_HEADER];
