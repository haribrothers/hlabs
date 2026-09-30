// Caddy's JSON config, built from ProxyState (02 §2.6). One HTTPS server answers the dashboard and every app by host
// name with certificates from Caddy's internal CA; one HTTP server serves the CA certificate and redirects to HTTPS,
// or, until onboarding is done, serves the dashboard (07 §7.1). App routes go through forward auth unless the app
// opted out (US-AUTH-17).
import { join } from 'node:path';
import { loopbackPort } from '../apps/ports';
import type { AppRoute } from '../apps/service';
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
 * An app that declares `web.embed` (D-038) may be framed by the dashboard (US-APP-01): its X-Frame-Options is dropped
 * and a `frame-ancestors` policy naming the dashboard's addresses is added. Added, not set, so the app's own policy
 * still applies; an app that forbids framing itself stays unframeable.
 */
function framedBy(ancestors: string[]) {
  return {
    headers: {
      response: {
        delete: ['X-Frame-Options'],
        add: { 'Content-Security-Policy': [`frame-ancestors ${ancestors.join(' ')}`] },
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

function appRoute(app: AppRoute, domain: string, daemon: string, ancestors: string[]) {
  const proxy = proxyTo(`127.0.0.1:${loopbackPort(app.port)}`);
  return {
    match: [{ host: [`${app.hostname}.${domain}`] }],
    handle: [
      { handler: 'headers', request: { delete: IDENTITY_HEADERS } },
      ...(app.auth === 'hlabs' ? [forwardAuth(daemon)] : []),
      app.embed ? { ...proxy, ...framedBy(ancestors) } : proxy,
    ],
    terminal: true,
  };
}

export function buildCaddyConfig(state: ProxyState, paths: CaddyPaths) {
  const domain = `${state.hostname}.local`;
  const hosts = [domain, ...state.apps.map((a) => `${a.hostname}.${domain}`)];
  const httpsPort = state.ports.https === 443 ? '' : `:${state.ports.https}`;
  // Where the dashboard runs, the only pages that may frame an app.
  const ancestors = [`https://${domain}${httpsPort}`, ...(state.tailnetHost ? [`https://${state.tailnetHost}`] : [])];

  const dashboard = {
    match: [{ host: [domain] }],
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
            routes: [dashboard, ...state.apps.map((a) => appRoute(a, domain, state.daemon, ancestors))],
            // When the daemon doesn't answer, the dashboard gets the fallback page (US-STATE-04).
            errors: {
              routes: [
                {
                  match: [{ host: [domain] }],
                  handle: [{ handler: 'subroute', ...fallbackErrorRoutes(paths.webFallbackDir) }],
                  terminal: true,
                },
              ],
            },
            automatic_https: { disable_redirects: true },
          },
          http: {
            listen: [`:${state.ports.http}`],
            routes: httpRoutes,
            automatic_https: { disable: true },
          },
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
