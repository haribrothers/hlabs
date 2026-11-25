// Headers only Caddy itself sets on the way to the daemon or an app; whatever a browser sends under these names is
// dropped first.

/** Who someone is: set only by forward auth. */
export const IDENTITY_HEADERS = ['X-Hlabs-User', 'X-Hlabs-Role'];

/**
 * Which public address a request came to (D-178): set only by the public listener, and dropped everywhere else (the
 * dashboard and every app route), so nobody on the home network can pass as a public visitor.
 */
export const PUBLIC_HOST_HEADER = 'X-Hlabs-Public-Host';
