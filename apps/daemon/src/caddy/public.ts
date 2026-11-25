// Caddy's public listener (US-APP-27, 28; D-178; 07 §7.10 controls 1, 3 and 4). cloudflared sends every public name
// here, on 127.0.0.1 only. It routes by name: each public app's own web service and hlabs's sign-in pages on its
// address, the dashboard on its own name only while an admin has made it public (US-SYS-45, D-182, 07 §7.11), and a
// 404 for any other name, so the dashboard, the daemon's API and private apps are otherwise never reachable from
// the internet. HTTPS on every leg (D-181): cloudflared reaches this listener over TLS with a certificate from hlabs's
// local CA (one internal name, PUBLIC_ORIGIN_NAME, never a public one), and a visit Cloudflare marks as plain HTTP is
// sent to its https:// address when it's a page (GET or HEAD) and refused otherwise, so a form or a sign-in never goes
// over plain HTTP. On every public address: HSTS, nosniff and `Referrer-Policy: strict-origin-when-cross-origin`, a request size limit, the
// visitor's address from `CF-Connecting-IP` with cloudflared as the only trusted proxy, identity headers only from
// forward auth, and hlabs's cookies taken out before the app sees the request.
import { loopbackPort } from '../apps/ports';
import { IDENTITY_HEADERS, PUBLIC_HOST_HEADER, VIA_HEADER } from './headers';
import type { PublicListener, PublicRoute } from './index';

/**
 * The name cloudflared asks for when it connects to the public listener (its `originServerName`), and the only name on
 * the listener's certificate: issued by hlabs's local CA, which cloudflared trusts for this and nothing else (D-181).
 * Visitors never see it; public addresses are routed by their Host header as before.
 */
export const PUBLIC_ORIGIN_NAME = 'public.hlabs.internal';

/** The logger Caddy writes the public listener's access log to (Visits, US-APP-29). */
export const PUBLIC_ACCESS_LOGGER = 'public';
export const PUBLIC_ACCESS_LOG = 'access.log';

/** hlabs's cookies, never passed to a public app (D-178): the public sign-in's and the dashboard's. */
export const STRIPPED_COOKIES = ['__Host-hlabs_pub', 'hlabs_session'];

export { PUBLIC_HOST_HEADER, VIA_HEADER };
const DAEMON_HEADERS = [PUBLIC_HOST_HEADER, VIA_HEADER];

/**
 * The largest request the public dashboard takes (07 §7.11 control 8): an upload chunk (16 MB, US-FILE-08) and a
 * little more; a wallpaper photo is 10 MB at most.
 */
export const DASHBOARD_MAX_BODY_MB = 20;

/**
 * Paths the public dashboard never passes on (D-182): forward auth and its pages (`/auth/*`), the public apps' sign-in
 * (`/.hlabs/*`), the development routes and the CA certificate. Everything else is the dashboard as at home.
 */
export const DASHBOARD_REFUSED_PATHS = ['/auth/*', '/.hlabs/*', '/dev/*', '/ca.crt'];

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

/** How Cloudflare marks a visit that reached it over plain HTTP. */
const PLAIN_HTTP = [
  { header: { 'X-Forwarded-Proto': ['http'] } },
  { header_regexp: { 'Cf-Visitor': { pattern: '"scheme"\\s*:\\s*"http"' } } },
];

/** The same address over HTTPS, for good (308 keeps the method; only GET and HEAD are sent here). */
function toHttps() {
  return {
    handler: 'static_response',
    status_code: 308,
    headers: {
      Location: ['https://{http.request.host}{http.request.uri}'],
      'Cache-Control': ['no-store'],
      ...PUBLIC_RESPONSE_HEADERS,
    },
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

/**
 * The dashboard on its public name (US-SYS-45, D-182; 07 §7.11): the dashboard's pages and the daemon's `/trpc`, `/api`
 * and file routes as on the home server (to the dashboard's upstream), with the public hardening, and
 * `X-Hlabs-Via: public` and `X-Hlabs-Public-Host` set on every request it passes on: the daemon's only sign that a
 * request came from the internet (every other server deletes them).
 */
function publicDashboardRoute(hostname: string, upstream: string) {
  return {
    match: [{ host: [hostname] }],
    handle: [
      {
        handler: 'subroute',
        routes: [
          {
            handle: [
              {
                handler: 'headers',
                request: { delete: [...IDENTITY_HEADERS, ...DAEMON_HEADERS] },
                response: { set: PUBLIC_RESPONSE_HEADERS, deferred: true },
              },
              { handler: 'request_body', max_size: DASHBOARD_MAX_BODY_MB * 1024 * 1024 },
            ],
          },
          { match: [{ path: DASHBOARD_REFUSED_PATHS }], handle: [page(404, 'Page not found')], terminal: true },
          {
            handle: [
              {
                handler: 'reverse_proxy',
                upstreams: [{ dial: upstream }],
                headers: {
                  request: {
                    set: {
                      ...VISITOR,
                      [VIA_HEADER]: ['public'],
                      [PUBLIC_HOST_HEADER]: ['{http.request.host}'],
                      // The upstream's own address as Host: the dashboard's dev server (Vite) refuses names it doesn't
                      // know, and the daemon reads the public name from X-Forwarded-Host (set above), never Host.
                      Host: ['{http.reverse_proxy.upstream.hostport}'],
                    },
                  },
                },
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
export function publicServer(listener: PublicListener, daemon: string, dashboardUpstream: string = daemon) {
  const hosts = listener.apps.map((a) => a.hostname);
  return {
    listen: [`127.0.0.1:${listener.port}`],
    // cloudflared on this computer is the only proxy trusted; the visitor's address is Cloudflare's CF-Connecting-IP.
    trusted_proxies: { source: 'static', ranges: ['127.0.0.1/32', '::1/128'] },
    client_ip_headers: ['Cf-Connecting-Ip'],
    routes: [
      // A visit Cloudflare marks as plain HTTP (the zone's "Always Use HTTPS" off): a page goes to its https:// address,
      // anything else is refused, so nothing is ever sent on over plain HTTP (D-181).
      ...PLAIN_HTTP.map((marked) => ({
        match: [{ ...marked, method: ['GET', 'HEAD'] }],
        handle: [toHttps()],
        terminal: true,
      })),
      { match: PLAIN_HTTP, handle: [page(403, 'HTTPS only')], terminal: true },
      ...(listener.dashboard ? [publicDashboardRoute(listener.dashboard.hostname, dashboardUpstream)] : []),
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
                  headers: {
                    request: {
                      set: { ...VISITOR, 'X-Hlabs-Public-Host': ['{http.request.host}'] },
                      delete: [VIA_HEADER],
                    },
                  },
                },
              ],
              terminal: true,
            },
          ]
        : [],
    },
    // TLS from cloudflared on loopback with the certificate for PUBLIC_ORIGIN_NAME (the tls app's `automate`, from the
    // local CA): Caddy manages no other certificate here and never asks for one for a public name (D-181).
    tls_connection_policies: [{ default_sni: PUBLIC_ORIGIN_NAME }],
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
