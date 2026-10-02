// Caddy's JSON config, built from ProxyState (02 §2.6). One HTTPS server answers the dashboard and every app by host
// name with certificates from Caddy's internal CA; one HTTP server serves the CA certificate and redirects to HTTPS,
// or, until onboarding is done, serves the dashboard (07 §7.1). App routes go through forward auth unless the app
// opted out (US-AUTH-17).
import { join } from 'node:path';
import { loopbackPort } from '../apps/ports';
import type { AppRoute } from '../apps/service';
import { appHosts, homeDomains } from '../network/domains';
import { fallbackErrorRoutes } from './fallback';
import type { ProxyState } from './index';

export interface CaddyPaths {
  /** Caddy's storage: the local CA, certificates, locks. */
  storageDir: string;
  /** Unix socket of the admin API (owner-only; D-073). */
  adminSocket: string;
  logFile: string;
  webFallbackDir: string;
}

/** Headers only forward auth may set; anything a browser sends under these names is dropped. */
export const IDENTITY_HEADERS = ['X-Hlabs-User', 'X-Hlabs-Role'];

/** Where Caddy's local CA keeps the root certificate that CertGuide offers (`GET /ca.crt`). */
export function caRootDir(storageDir: string): string {
  return join(storageDir, 'pki', 'authorities', 'local');
}

const proxyTo = (dial: string) => ({ handler: 'reverse_proxy', upstreams: [{ dial }] });

/**
 * An app that declares `web.embed` (D-038) may be framed by the dashboard, and only by it (US-APP-01): its
 * X-Frame-Options is dropped, a `frame-ancestors` in its own policy (often `'self'`) is rewritten to the dashboard's
 * addresses, and a policy saying the same is added for apps that send none. The rest of the app's policy is kept.
 */
function framedBy(ancestors: string[]) {
  const directive = `frame-ancestors ${ancestors.join(' ')}`;
  return {
    headers: {
      response: {
        delete: ['X-Frame-Options'],
        add: { 'Content-Security-Policy': [directive] },
        replace: { 'Content-Security-Policy': [{ search_regexp: 'frame-ancestors[^;]*', replace: directive }] },
      },
    },
  };
}

function forwardAuth(daemon: string) {
  return {
    handler: 'reverse_proxy',
    upstreams: [{ dial: daemon }],
    rewrite: { method: 'GET', uri: '/auth/verify' },
    headers: {
      request: {
        set: {
          'X-Forwarded-Method': ['{http.request.method}'],
          'X-Forwarded-Uri': ['{http.request.uri}'],
        },
      },
    },
    // 2xx: carry the user on to the app. Anything else (302 to log in, 403 "no access") goes back to the browser.
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

function appRoute(app: AppRoute, hostname: string, daemon: string, ancestors: string[]) {
  const proxy = proxyTo(`127.0.0.1:${loopbackPort(app.port)}`);
  return {
    match: [{ host: appHosts(app.hostname, hostname) }],
    handle: [
      { handler: 'headers', request: { delete: IDENTITY_HEADERS } },
      ...(app.auth === 'hlabs' ? [forwardAuth(daemon)] : []),
      app.embed ? { ...proxy, ...framedBy(ancestors) } : proxy,
    ],
    terminal: true,
  };
}

/**
 * An app that doesn't answer (502–504): the daemon says why, the engine-stopped page while the engine is down
 * (US-STATE-08), or lets the error stand.
 */
function appUnavailable(daemon: string, hosts?: string[]) {
  return {
    match: [{ ...(hosts ? { host: hosts } : {}), expression: '{http.error.status_code} in [502, 503, 504]' }],
    handle: [
      {
        handler: 'reverse_proxy',
        upstreams: [{ dial: daemon }],
        rewrite: { method: 'GET', uri: '/auth/unavailable' },
        headers: { request: { set: { 'X-Forwarded-Host': ['{http.request.hostport}'] } } },
      },
    ],
    terminal: true,
  };
}

/**
 * An app on its own port, under any name (D-086): `https://hlabs.local:<port>` when its name can't be published
 * (US-APP-05), and its tailnet address. TLS with the dashboard's certificate.
 */
function appPortServer(app: AppRoute, hostname: string, daemon: string, ancestors: string[]) {
  const domain = homeDomains(hostname)[0];
  const { match: _host, ...route } = appRoute(app, hostname, daemon, ancestors);
  return {
    listen: [`:${app.port}`],
    routes: [route],
    errors: { routes: [appUnavailable(daemon)] },
    tls_connection_policies: [{ default_sni: domain }],
    automatic_https: { disable_redirects: true },
  };
}

/** `appPorts: false` leaves out the apps' own ports, for when another program holds one of them. */
export function buildCaddyConfig(state: ProxyState, paths: CaddyPaths, opts: { appPorts?: boolean } = {}) {
  // The dashboard and every app answer on `.local` (mDNS) and `.home.arpa` (DNS servers, D-105).
  const domains = homeDomains(state.hostname);
  const appNames = state.apps.flatMap((a) => appHosts(a.hostname, state.hostname));
  const hosts = [...domains, ...appNames];
  const httpsPort = state.ports.https === 443 ? '' : `:${state.ports.https}`;
  // Where the dashboard runs, the only pages that may frame an app.
  const ancestors = [
    ...domains.map((d) => `https://${d}${httpsPort}`),
    ...(state.tailnetHost ? [`https://${state.tailnetHost}`] : []),
  ];

  const dashboard = {
    match: [{ host: domains }],
    handle: [{ handler: 'headers', request: { delete: IDENTITY_HEADERS } }, proxyTo(state.dashboardUpstream)],
    terminal: true,
  };
  const caCert = {
    match: [{ path: ['/ca.crt'] }],
    handle: [
      {
        handler: 'headers',
        response: {
          set: {
            'Content-Type': ['application/x-x509-ca-cert'],
            'Content-Disposition': ['attachment; filename="hlabs-ca.crt"'],
          },
        },
      },
      { handler: 'rewrite', uri: '/root.crt' },
      { handler: 'file_server', root: caRootDir(paths.storageDir) },
    ],
    terminal: true,
  };
  const httpRoutes = state.onboardingComplete
    ? [
        caCert,
        {
          handle: [
            {
              handler: 'static_response',
              status_code: 308,
              headers: { Location: [`https://{http.request.host}${httpsPort}{http.request.uri}`] },
            },
          ],
          terminal: true,
        },
      ]
    : // During onboarding the dashboard answers on plain HTTP under any name or address (the CA isn't trusted yet).
      [caCert, { ...dashboard, match: undefined }];

  return {
    admin: { listen: `unix/${paths.adminSocket}`, config: { persist: false } },
    storage: { module: 'file_system', root: paths.storageDir },
    logging: {
      logs: {
        default: {
          writer: { output: 'file', filename: paths.logFile, roll_size_mb: 10, roll_keep: 3 },
          level: 'WARN',
        },
      },
    },
    apps: {
      http: {
        http_port: state.ports.http,
        https_port: state.ports.https,
        servers: {
          https: {
            listen: [`:${state.ports.https}`],
            // The CA certificate on the dashboard over HTTPS too, so "Trust hlabs on this device" can download it
            // from the page it's on (a plain-HTTP download from an HTTPS page is blocked; D-097).
            routes: [
              { ...caCert, match: [{ host: domains, path: ['/ca.crt'] }] },
              dashboard,
              ...state.apps.map((a) => appRoute(a, state.hostname, state.daemon, ancestors)),
            ],
            // When the daemon doesn't answer, the dashboard gets the fallback page (US-STATE-04).
            errors: {
              routes: [
                {
                  match: [{ host: domains }],
                  handle: [{ handler: 'subroute', ...fallbackErrorRoutes(paths.webFallbackDir) }],
                  terminal: true,
                },
                ...(state.apps.length ? [appUnavailable(state.daemon, appNames)] : []),
              ],
            },
            automatic_https: { disable_redirects: true },
          },
          http: {
            listen: [`:${state.ports.http}`],
            routes: httpRoutes,
            automatic_https: { disable: true },
          },
          ...(opts.appPorts === false
            ? {}
            : Object.fromEntries(
                state.apps.map((a) => [`app-${a.appId}`, appPortServer(a, state.hostname, state.daemon, ancestors)]),
              )),
        },
      },
      tls: {
        automation: { policies: [{ subjects: hosts, issuers: [{ module: 'internal' }] }] },
      },
      // Trust is installed by people through CertGuide, never by Caddy asking for an admin password.
      pki: { certificate_authorities: { local: { name: 'hlabs Local CA', install_trust: false } } },
    },
  };
}
