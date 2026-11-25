// Caddy's public listener (US-APP-27, 28; D-178; 07 §7.10 controls 1, 3 and 4). cloudflared sends every public name
// here, on 127.0.0.1 only. It routes by name: each public app's own web service and hlabs's sign-in pages on its
// address, and a 404 for any other name, so the dashboard, the daemon's API and private apps are never reachable from
// the internet. On every public address: HTTPS only (a request Cloudflare marks as plain HTTP is refused, not
// redirected), HSTS, nosniff and `Referrer-Policy: strict-origin-when-cross-origin`, a request size limit, the
// visitor's address from `CF-Connecting-IP` with cloudflared as the only trusted proxy, identity headers only from
// forward auth, and hlabs's cookies taken out before the app sees the request.
import { loopbackPort } from '../apps/ports';
import { IDENTITY_HEADERS, PUBLIC_HOST_HEADER } from './headers';
import type { PublicListener, PublicRoute } from './index';

/** The logger Caddy writes the public listener's access log to (Visits, US-APP-29). */
export const PUBLIC_ACCESS_LOGGER = 'public';
export const PUBLIC_ACCESS_LOG = 'access.log';

/** hlabs's cookies, never passed to a public app (D-178): the public sign-in's and the dashboard's. */
export const STRIPPED_COOKIES = ['__Host-hlabs_pub', 'hlabs_session'];

export { PUBLIC_HOST_HEADER };
const DAEMON_HEADERS = [PUBLIC_HOST_HEADER];

/** Every public response (07 §7.10 control 4). Not X-Frame-Options or a CSP: those are the app's to choose. */
export const PUBLIC_RESPONSE_HEADERS: Record<string, string[]> = {
  'Strict-Transport-Security': ['max-age=31536000'],
  'X-Content-Type-Options': ['nosniff'],
  // Not no-referrer: Safari then sends `Origin: null` with the sign-in form, and the sign-in is refused (D-178).
  'Referrer-Policy': ['strict-origin-when-cross-origin'],
};

/** The visitor as the app and the daemon see it: from CF-Connecting-IP, through cloudflared only. */
const VISITOR = {
  'X-Forwarded-For': ['{http.vars.client_ip}'],
  'X-Real-Ip': ['{http.vars.client_ip}'],
  'X-Forwarded-Proto': ['https'],
  'X-Forwarded-Host': ['{http.request.host}'],
};

/** A small typed page from Caddy itself (D-178: an untyped reply is a download on iPhone). */
function page(status: number, title: string) {
  return {
    handler: 'static_response',
    status_code: status,
    headers: {
      'Content-Type': ['text/html; charset=utf-8'],
      'Cache-Control': ['no-store'],
      ...PUBLIC_RESPONSE_HEADERS,
    },
    body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body><h1>${title}</h1></body></html>`,
  };
}

/** One of hlabs's pages on the public address, always that exact path (nothing else under /.hlabs reaches the daemon). */
function daemonPage(daemon: string, path: string) {
  return {
    match: [{ path: [path] }],
    handle: [
      {
        handler: 'reverse_proxy',
        upstreams: [{ dial: daemon }],
        rewrite: { uri: `${path}?{http.request.uri.query}` },
        headers: { request: { set: { ...VISITOR, 'X-Hlabs-Public-Host': ['{http.request.host}'] } } },
      },
    ],
    terminal: true,
  };
}

/** Forward auth for a public address: the daemon's `/auth/public-verify`, with the public sign-in's cookie. */
function publicForwardAuth(daemon: string) {
  return {
    handler: 'reverse_proxy',
    upstreams: [{ dial: daemon }],
    rewrite: { method: 'GET', uri: '/auth/public-verify' },
    headers: {
      request: {
        set: {
          ...VISITOR,
          'X-Hlabs-Public-Host': ['{http.request.host}'],
          'X-Forwarded-Method': ['{http.request.method}'],
          'X-Forwarded-Uri': ['{http.request.uri}'],
        },
      },
    },
    // 2xx: carry the person on to the app. Anything else (302 to sign in, 401, 403) goes back to the visitor.
    handle_response: [
      {
        match: { status_code: [2] },
        routes: [
          {
            handle: [
              {
                handler: 'headers',
                request: {
                  set: Object.fromEntries(IDENTITY_HEADERS.map((h) => [h, [`{http.reverse_proxy.header.${h}}`]])),
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

/** hlabs's cookies out of the request, and the Cookie header gone when nothing is left (D-178). */
export function stripHlabsCookies() {
  const names = STRIPPED_COOKIES.map((c) => c.replace(/[-.]/g, (ch) => `\\${ch}`)).join('|');
  return [
    {
      handler: 'headers',
      request: { replace: { Cookie: [{ search_regexp: `(?:^|;\\s*)(?:${names})=[^;]*`, replace: '' }] } },
    },
    { handler: 'headers', request: { replace: { Cookie: [{ search_regexp: '^\\s*;\\s*', replace: '' }] } } },
    {
      handler: 'subroute',
      routes: [
        {
          match: [{ header_regexp: { Cookie: { pattern: '^\\s*$' } } }],
          handle: [{ handler: 'headers', request: { delete: ['Cookie'] } }],
        },
      ],
    },
  ];
}

function publicAppRoute(app: PublicRoute, daemon: string) {
  return {
    match: [{ host: [app.hostname] }],
    handle: [
      {
        handler: 'subroute',
        routes: [
          {
            handle: [
              {
                handler: 'headers',
                // Only forward auth says who someone is; only Caddy says which public address this is.
                request: { delete: [...IDENTITY_HEADERS, ...DAEMON_HEADERS] },
                response: { set: PUBLIC_RESPONSE_HEADERS, deferred: true },
              },
              { handler: 'request_body', max_size: app.maxBodyMb * 1024 * 1024 },
            ],
          },
          ...(app.access === 'hlabs'
            ? [
                daemonPage(daemon, '/.hlabs/sign-in'),
                daemonPage(daemon, '/.hlabs/sign-out'),
                { match: [{ path: ['/.hlabs/*'] }], handle: [page(404, 'Page not found')], terminal: true },
              ]
            : []),
          {
            handle: [
              ...(app.access === 'hlabs' ? [publicForwardAuth(daemon)] : []),
              ...stripHlabsCookies(),
              {
                handler: 'reverse_proxy',
                upstreams: [{ dial: `127.0.0.1:${loopbackPort(app.port)}` }],
                headers: { request: { set: VISITOR } },
              },
            ],
          },
        ],
      },
    ],
    terminal: true,
  };
}

/** The public listener's server (`servers.public` in Caddy's config). */
export function publicServer(listener: PublicListener, daemon: string) {
  const hosts = listener.apps.map((a) => a.hostname);
  return {
    listen: [`127.0.0.1:${listener.port}`],
    // cloudflared on this computer is the only proxy trusted; the visitor's address is Cloudflare's CF-Connecting-IP.
    trusted_proxies: { source: 'static', ranges: ['127.0.0.1/32', '::1/128'] },
    client_ip_headers: ['Cf-Connecting-Ip'],
    routes: [
      // HTTPS only: Cloudflare already upgrades http:// at its edge, so a request marked plain HTTP is refused.
      {
        match: [
          { header: { 'X-Forwarded-Proto': ['http'] } },
          { header_regexp: { 'Cf-Visitor': { pattern: '"scheme"\\s*:\\s*"http"' } } },
        ],
        handle: [page(403, 'HTTPS only')],
        terminal: true,
      },
      ...listener.apps.map((a) => publicAppRoute(a, daemon)),
      // A name hlabs doesn't know (or an app made private a moment ago).
      { handle: [page(404, 'Page not found')], terminal: true },
    ],
    // A stopped public app: the daemon's "<App> isn't running" page (US-APP-27).
    errors: {
      routes: hosts.length
        ? [
            {
              match: [{ host: hosts, expression: '{http.error.status_code} in [502, 503, 504]' }],
              handle: [
                {
                  handler: 'reverse_proxy',
                  upstreams: [{ dial: daemon }],
                  rewrite: { method: 'GET', uri: '/auth/unavailable' },
                  headers: { request: { set: { ...VISITOR, 'X-Hlabs-Public-Host': ['{http.request.host}'] } } },
                },
              ],
              terminal: true,
            },
          ]
        : [],
    },
    // Plain HTTP from cloudflared on loopback: no certificates, and never one asked for a public name.
    automatic_https: { disable: true },
    logs: { default_logger_name: PUBLIC_ACCESS_LOGGER },
  };
}

/** The access log's writer: JSON lines, kept 7 days, never in backups or diagnostics (US-APP-29). */
export function publicAccessLog(listener: PublicListener) {
  return {
    writer: {
      output: 'file',
      filename: `${listener.logDir}/${PUBLIC_ACCESS_LOG}`,
      roll_size_mb: 10,
      roll_keep: 20,
      roll_keep_days: 7,
    },
    encoder: { format: 'json' },
    level: 'INFO',
    include: [`http.log.access.${PUBLIC_ACCESS_LOGGER}`],
  };
}
